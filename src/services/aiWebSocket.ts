import Taro from '@tarojs/taro'
import {supabase} from '../client/supabase'

type MessageType = 'asr-interim' | 'asr-final' | 'llm-interim' | 'llm-final' | 'audio' | 'tts-start' | 'tts-end' | 'event'
type Listener = (data: string | ArrayBuffer) => void
type ConnectMode = 'cfg' | 'default'
type RequestKind = 'text' | 'image'

type AiWebSocketMetrics = {
  mode: ConnectMode
  startedAt: number
  requestKind?: RequestKind
  promptLength?: number
  wsSignMs?: number
  socketOpenMs?: number
  mediaReadyMs?: number
  connectReadyMs?: number
  sendToFirstInterimMs?: number
  sendToFinalMs?: number
  imageUploadMs?: number
  totalMs?: number
  status?: 'connected' | 'final' | 'timeout' | 'error'
}

type WsCfg = Record<string, unknown>

interface ConnectOptions {
  mode?: ConnectMode
  cfg?: WsCfg
  ac?: string
  userId?: string
}

interface ImageRequestOptions {
  triggerText: string
  imageBase64: string
  fileName: string
  finalText: string
  uploadTimeoutMs?: number
  responseTimeoutMs?: number
  onInterim?: (text: string) => void
}

interface RequestResponseOptions {
  image?: string
  fileName?: string
  timeoutMs?: number
  onInterim?: (text: string) => void
  onAudio?: (buffer: ArrayBuffer) => void
  onTtsStart?: () => void
  onTtsEnd?: () => void
}

interface SignResponse {
  url: string
  licenseKey?: string
  licenseDeviceId?: string
}

class AiWebSocketService {
  private socketTask: Taro.SocketTask | null = null
  private socketTaskPromise: Promise<Taro.SocketTask> | null = null
  private state: 'disconnected' | 'connecting' | 'connected' = 'disconnected'
  private listeners = new Map<MessageType, Set<Listener>>()
  private readyResolve: (() => void) | null = null
  private readyReject: ((error: Error) => void) | null = null
  private mediaReady = false
  private licenseRequired = false
  private licensePassed = false
  private licenseKey = ''
  private licenseDeviceId = ''
  private userId = ''
  private metrics: AiWebSocketMetrics | null = null
  private socketStartedAt = 0
  private requestStartedAt = 0
  private licenseWaitTimer: ReturnType<typeof setTimeout> | null = null

  get isConnected() { return this.state === 'connected' }

  async connect(options: ConnectOptions): Promise<void> {
    if (this.state === 'connected') return
    if (this.state === 'connecting') {
      // ★ Bug2 修复：加入 disconnected 检测 + 超时，防止永久 polling 死循环
      return new Promise((resolve, reject) => {
        const started = Date.now()
        const check = setInterval(() => {
          if (this.state === 'connected') {
            clearInterval(check)
            resolve()
          } else if (this.state === 'disconnected') {
            clearInterval(check)
            reject(new Error('WebSocket connect failed (concurrent)'))
          } else if (Date.now() - started > 16000) {
            clearInterval(check)
            reject(new Error('WebSocket connect timeout (concurrent)'))
          }
        }, 50)
      })
    }

    this.state = 'connecting'
    this.socketTask = null
    this.socketTaskPromise = null
    this.metrics = {
      mode: options.mode || 'cfg',
      startedAt: Date.now(),
    }
    this.socketStartedAt = 0
    this.requestStartedAt = 0
    this.mediaReady = false
    this.licenseRequired = false
    this.licensePassed = false

    console.log('[AiWebSocket] invoking ws-sign EF, mode=', options.mode || 'cfg')
    let data: SignResponse | null = null
    try {
      const result = await supabase.functions.invoke<SignResponse>('ws-sign', {
        body: {
          mode: options.mode || 'cfg',
          cfg: options.cfg,
          ac: options.ac || 'raw16k'
        }
      })
      if (result.error) {
        console.error('[AiWebSocket] ws-sign EF error:', result.error)
        // ★ Bug1 修复：任何 throw 前必须重置 state，否则下次调用进入 polling 死循环
        this.state = 'disconnected'
        throw new Error(`ws-sign failed: ${result.error.message || JSON.stringify(result.error)}`)
      }
      if (!result.data?.url) {
        console.error('[AiWebSocket] ws-sign EF returned no url, data=', JSON.stringify(result.data))
        this.state = 'disconnected'
        throw new Error('ws-sign returned empty url')
      }
      data = result.data
      this.metrics.wsSignMs = Date.now() - this.metrics.startedAt
    } catch (err) {
      // 捕获网络超时等意外错误，确保 state 归位
      this.state = 'disconnected'
      this.logMetrics('error')
      throw err
    }
    console.log('[AiWebSocket] ws-sign OK, url prefix=', data.url.substring(0, 80))
    this.licenseKey = data.licenseKey || ''
    this.licenseDeviceId = data.licenseDeviceId || Taro.getStorageSync('brtc_license_device_id') || ''
    this.userId = options.userId || ''

    return new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject

      console.log('[AiWebSocket] Taro.connectSocket starting...')
      this.socketStartedAt = Date.now()
      const connectResult = Taro.connectSocket({
        url: data.url,
        success: () => {
          console.log('[AiWebSocket] Taro.connectSocket API call success')
        },
        fail: (err) => {
          const msg = err?.errMsg || 'WebSocket connect failed'
          console.error('[AiWebSocket] Taro.connectSocket fail:', msg)
          this.state = 'disconnected'
          if (this.readyReject) {
            this.readyReject(new Error(msg))
            this.readyReject = null
            this.readyResolve = null
          }
        }
      })

      this.socketTaskPromise = Promise.resolve(connectResult as unknown as Taro.SocketTask)
      this.socketTaskPromise
        .then((task) => {
          if (!this.socketTaskPromise) return
          this.socketTask = task

          task.onOpen(() => {
            console.log('[AiWebSocket] WebSocket onOpen fired')
            if (this.metrics && this.socketStartedAt > 0) {
              this.metrics.socketOpenMs = Date.now() - this.socketStartedAt
            }
          })

          task.onMessage((res) => {
            if (res.data instanceof ArrayBuffer) {
              this.emit('audio', res.data)
              return
            }
            const msg = res.data as string
            this.dispatch(msg)
          })

          task.onClose((res) => {
            console.log('[AiWebSocket] WebSocket onClose:', res?.code, res?.reason)
            if (this.socketTask !== task) return
            this.state = 'disconnected'
            this.socketTask = null
            this.socketTaskPromise = null
            if (this.readyReject) {
              this.readyReject(new Error(`WebSocket closed: ${res?.reason || 'unknown'}`))
              this.readyReject = null
              this.readyResolve = null
            }
          })

          task.onError((err) => {
            const errMsg = (err as any)?.errMsg || (err as any)?.message || JSON.stringify(err)
            console.error('[AiWebSocket] WebSocket onError:', errMsg)
            if (this.socketTask !== task) return
            this.state = 'disconnected'
            this.socketTask = null
            this.socketTaskPromise = null
            if (this.readyReject) {
              this.readyReject(new Error(`WebSocket error: ${errMsg}`))
              this.readyReject = null
              this.readyResolve = null
            }
          })
        })
        .catch((err) => {
          const errMsg = err?.errMsg || err?.message || JSON.stringify(err)
          console.error('[AiWebSocket] Taro.connectSocket task error:', errMsg)
          this.rejectReady(new Error(`WebSocket connect failed: ${errMsg}`))
        })

      setTimeout(() => {
        if (this.state === 'connecting') {
          console.error('[AiWebSocket] connect timeout (15s) — MEDIA READY not received')
          this.logMetrics('timeout')
          this.rejectReady(new Error('WebSocket connect timeout'))
        }
      }, 15000)
    })
  }

  disconnect() {
    this.closeSocketTask()
    this.state = 'disconnected'
    this.listeners.clear()
    this.readyResolve = null
    this.readyReject = null
    this.mediaReady = false
    this.licenseRequired = false
    this.licensePassed = false
    this.metrics = null
    this.socketStartedAt = 0
    this.requestStartedAt = 0
    if (this.licenseWaitTimer) clearTimeout(this.licenseWaitTimer)
    this.licenseWaitTimer = null
  }

  private closeSocketTask() {
    const task = this.socketTask
    const hadPendingTask = !!this.socketTaskPromise
    this.socketTask = null
    this.socketTaskPromise = null
    if (!task) {
      if (hadPendingTask) Taro.closeSocket({})
      return
    }
    if (typeof task.close === 'function') {
      task.close({})
    } else {
      Taro.closeSocket({})
    }
  }

  private rejectReady(error: Error) {
    this.closeSocketTask()
    this.state = 'disconnected'
    if (this.readyReject) {
      this.readyReject(error)
      this.readyReject = null
      this.readyResolve = null
    }
  }

  private async getSocketTask(): Promise<Taro.SocketTask | null> {
    if (this.socketTask) return this.socketTask
    if (!this.socketTaskPromise) return null
    try {
      this.socketTask = await this.socketTaskPromise
      return this.socketTask
    } catch {
      return null
    }
  }

  sendText(text: string) {
    void this.sendSocketData(`[T]:${text}`).catch((err) => {
      console.warn('[AiWebSocket] sendText failed:', err?.message || err)
    })
  }

  sendAudio(buffer: ArrayBuffer) {
    void this.sendSocketData(buffer).catch((err) => {
      console.warn('[AiWebSocket] sendAudio failed:', err?.message || err)
    })
  }

  sendDeviceInfo(userId?: string) {
    const uid = userId || this.userId
    if (!uid) return
    void this.sendSocketData(`[SET]:[DEVICE_INFO]:${JSON.stringify({
      user_id: uid,
      userId: uid,
    })}`).catch((err) => {
      console.warn('[AiWebSocket] sendDeviceInfo failed:', err?.message || err)
    })
  }

  onMessage(type: MessageType, cb: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(cb)
    return () => { this.listeners.get(type)?.delete(cb) }
  }

  async requestResponse(text: string, opts?: RequestResponseOptions): Promise<string> {
    if (opts?.image) {
      return this.requestImageResponse({
        triggerText: text,
        imageBase64: opts.image,
        fileName: opts.fileName || 'image.jpg',
        finalText: text,
        responseTimeoutMs: opts.timeoutMs
      })
    }

    this.beginRequest('text', text.length)
    return new Promise((resolve, reject) => {
      let interimText = ''
      let finalText = ''
      let ttsStarted = false
      let settled = false
      let ttsWaitTimer: ReturnType<typeof setTimeout> | null = null
      let audioIdleTimer: ReturnType<typeof setTimeout> | null = null
      let audioCompletionNotified = false
      let audioChunkCount = 0
      let audioByteCount = 0
      const ttsNoAudioGraceMs = 15000
      const ttsNotStartedGraceMs = 1200
      const audioIdleMs = 1200
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        if (interimText.trim()) {
          console.warn('[AiWebSocket] AI response timeout, using interim reply')
          this.markFinalResponse('timeout')
          resolve(interimText.trim())
          return
        }
        this.logMetrics('timeout')
        reject(new Error('AI response timeout'))
      }, opts?.timeoutMs || 30000)

      const cleanup = () => {
        clearTimeout(timeout)
        if (ttsWaitTimer) clearTimeout(ttsWaitTimer)
        if (audioIdleTimer) clearTimeout(audioIdleTimer)
        unsubFinal()
        unsubInterim()
        unsubAudio()
        unsubTtsStart()
        unsubTtsEnd()
      }

      const notifyAudioComplete = () => {
        if (audioCompletionNotified) return
        audioCompletionNotified = true
        opts?.onTtsEnd?.()
      }

      const finish = (textToResolve: string) => {
        if (settled) return
        settled = true
        cleanup()
        this.markFinalResponse('final')
        resolve(textToResolve)
      }

      const scheduleFinishAfterFinal = () => {
        if (!finalText || settled) return
        if (!opts?.onAudio && !opts?.onTtsEnd) {
          finish(finalText)
          return
        }
        if (audioChunkCount > 0) {
          if (audioIdleTimer) clearTimeout(audioIdleTimer)
          audioIdleTimer = setTimeout(() => {
            console.info('[AiWebSocket] RTC TTS audio idle, finishing response', {
              audioChunkCount,
              audioByteCount,
            })
            notifyAudioComplete()
            finish(finalText)
          }, audioIdleMs)
          return
        }
        if (ttsWaitTimer) clearTimeout(ttsWaitTimer)
        ttsWaitTimer = setTimeout(() => {
          console.warn('[AiWebSocket] RTC TTS audio not received before grace timeout', {
            ttsStarted,
            waitedMs: ttsStarted ? ttsNoAudioGraceMs : ttsNotStartedGraceMs,
          })
          finish(finalText)
        }, ttsStarted ? ttsNoAudioGraceMs : ttsNotStartedGraceMs)
      }

      const unsubFinal = this.onMessage('llm-final', (data) => {
        finalText = data as string
        clearTimeout(timeout)
        scheduleFinishAfterFinal()
      })

      const unsubInterim = this.onMessage('llm-interim', (data) => {
        this.markFirstInterim()
        interimText = this.mergeInterimText(interimText, data as string)
        if (interimText.trim()) opts?.onInterim?.(interimText.trim())
      })

      const unsubAudio = this.onMessage('audio', (data) => {
        if (!(data instanceof ArrayBuffer)) return
        audioChunkCount += 1
        audioByteCount += data.byteLength
        console.log('[AiWebSocket] audio chunk received', {
          size: data.byteLength,
          audioChunkCount,
          audioByteCount,
        })
        opts?.onAudio?.(data)
        scheduleFinishAfterFinal()
      })

      const unsubTtsStart = this.onMessage('tts-start', () => {
        ttsStarted = true
        opts?.onTtsStart?.()
        scheduleFinishAfterFinal()
      })

      const unsubTtsEnd = this.onMessage('tts-end', () => {
        notifyAudioComplete()
        if (finalText) finish(finalText)
      })

      void this.sendSocketData(`[T]:${text}`).catch((err) => {
        cleanup()
        this.logMetrics('error')
        reject(err)
      })
    })
  }

  async requestImageResponse(options: ImageRequestOptions): Promise<string> {
    const uploadTimeoutMs = options.uploadTimeoutMs || 15000
    const responseTimeoutMs = options.responseTimeoutMs || 45000

    this.beginRequest('image', options.finalText.length)
    return new Promise((resolve, reject) => {
      let imageSent = false
      let interimText = ''
      let responseTimer: ReturnType<typeof setTimeout> | null = null

      const uploadTimer = setTimeout(() => {
        cleanup()
        reject(new Error('Image upload was not requested by agent'))
      }, uploadTimeoutMs)

      const cleanup = () => {
        clearTimeout(uploadTimer)
        if (responseTimer) clearTimeout(responseTimer)
        unsubEvent()
        unsubFinal()
        unsubInterim()
      }

      const waitFinalResponse = () => {
        responseTimer = setTimeout(() => {
          cleanup()
          if (interimText.trim()) {
            console.warn('[AiWebSocket] AI image response timeout, using interim reply')
            this.markFinalResponse('timeout')
            resolve(interimText.trim())
            return
          }
          this.logMetrics('timeout')
          reject(new Error('AI image response timeout'))
        }, responseTimeoutMs)
      }

      const unsubEvent = this.onMessage('event', async (data) => {
        const msg = data as string
        if (!msg.startsWith('[E]:[UPLOAD_IMAGE]') || imageSent) return
        imageSent = true
        clearTimeout(uploadTimer)
        try {
          const uploadStartedAt = Date.now()
          await this.sendImageChunks(options.imageBase64, options.fileName)
          if (this.metrics) this.metrics.imageUploadMs = Date.now() - uploadStartedAt
          await this.sendSocketData(`[T]:${options.finalText}`)
          waitFinalResponse()
        } catch (err) {
          cleanup()
          this.logMetrics('error')
          reject(err as Error)
        }
      })

      const unsubFinal = this.onMessage('llm-final', (data) => {
        if (!imageSent) return
        cleanup()
        this.markFinalResponse('final')
        resolve(data as string)
      })

      const unsubInterim = this.onMessage('llm-interim', (data) => {
        if (!imageSent) return
        this.markFirstInterim()
        interimText = this.mergeInterimText(interimText, data as string)
        if (interimText.trim()) options.onInterim?.(interimText.trim())
      })

      void this.sendSocketData(`[T]:${options.triggerText}`).catch((err) => {
        cleanup()
        this.logMetrics('error')
        reject(err)
      })
    })
  }

  private async sendImageChunks(base64: string, fileName: string) {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64
    const imageBuffer = Taro.base64ToArrayBuffer(raw)
    const imageBytes = new Uint8Array(imageBuffer)
    const chunkSize = 16384
    const totalChunks = Math.ceil(imageBytes.length / chunkSize)
    console.log(`[AiWebSocket] sendImageChunks start: file=${fileName} size=${imageBytes.length}B chunks=${totalChunks}`)

    for (let offset = 0; offset < imageBytes.length; offset += chunkSize) {
      const chunk = imageBytes.slice(offset, Math.min(offset + chunkSize, imageBytes.length))
      const header = offset === 0 ? `\x18[T]=binary;[N]=${fileName}\n` : '\x10'
      const headerBytes = this.encodeAscii(header)
      const sendBytes = new Uint8Array(headerBytes.length + chunk.length)
      sendBytes.set(headerBytes, 0)
      sendBytes.set(chunk, headerBytes.length)
      const frameBuffer = sendBytes.buffer.slice(sendBytes.byteOffset, sendBytes.byteOffset + sendBytes.byteLength) as ArrayBuffer
      await this.sendSocketData(`[E]:[IMG]:${Taro.arrayBufferToBase64(frameBuffer)}`)
    }

    // 结束帧：\x14 → base64 = FA==
    const endBytes = this.encodeAscii('\x14')
    const endBuffer = endBytes.buffer.slice(endBytes.byteOffset, endBytes.byteOffset + endBytes.byteLength) as ArrayBuffer
    const endFrame = Taro.arrayBufferToBase64(endBuffer)
    console.log(`[AiWebSocket] sendImageChunks end frame: [E]:[IMG]:${endFrame}`)
    await this.sendSocketData(`[E]:[IMG]:${endFrame}`)
    console.log('[AiWebSocket] sendImageChunks done')
  }

  private encodeAscii(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff
    return bytes
  }

  private mergeInterimText(current: string, next: string): string {
    if (!next) return current
    if (!current) return next
    if (next.startsWith(current)) return next
    if (current.endsWith(next)) return current
    return `${current}${next}`
  }

  private async sendSocketData(data: string | ArrayBuffer): Promise<void> {
    const task = await this.getSocketTask()
    return new Promise((resolve, reject) => {
      if (!task) {
        reject(new Error('WebSocket is not connected'))
        return
      }
      task.send({
        data,
        success: () => resolve(),
        fail: (err) => reject(new Error(err.errMsg || 'WebSocket send failed'))
      })
    })
  }

  private dispatch(msg: string) {
    console.log('[AiWebSocket] recv:', msg.substring(0, 80))
    if (msg.startsWith('[E]:[MEDIA]:[READY]')) {
      this.mediaReady = true
      if (this.metrics && this.socketStartedAt > 0) {
        this.metrics.mediaReadyMs = Date.now() - this.socketStartedAt
      }
      this.tryResolveReady()
      this.emit('event', msg)
    } else if (msg.startsWith('[E]:[LIC]:[MUST]')) {
      this.licenseRequired = true
      this.activateLicense()
      this.emit('event', msg)
    } else if (msg.startsWith('[E]:[LIC]:[RES]:[PASS]')) {
      this.licensePassed = true
      this.tryResolveReady()
      this.emit('event', msg)
    } else if (msg.startsWith('[E]:[LIC]:[RES]:[FAILED]')) {
      // License 校验失败时降级为不校验，避免阻塞正常聊天/识图流程
      this.licensePassed = true
      this.tryResolveReady()
      this.emit('event', msg)
    } else if (msg.startsWith('[E]:[TTS_BEGIN_SPEAKING]')) {
      this.emit('tts-start', msg)
      this.emit('event', msg)
    } else if (msg.startsWith('[E]:[TTS_END_SPEAKING]')) {
      this.emit('tts-end', msg)
      this.emit('event', msg)
    } else if (msg.startsWith('[Q]:[M]:')) {
      this.emit('asr-interim', msg.slice(8))
    } else if (msg.startsWith('[Q]:')) {
      this.emit('asr-final', msg.slice(4))
    } else if (msg.startsWith('[A]:[M]:')) {
      this.emit('llm-interim', msg.slice(8))
    } else if (msg.startsWith('[A]:')) {
      this.emit('llm-final', msg.slice(4))
    } else if (msg.startsWith('[E]')) {
      this.emit('event', msg)
    }
  }

  private activateLicense() {
    if (!this.licenseKey) {
      // 无 License Key 时直接跳过，避免阻塞正常流程
      this.licensePassed = true
      this.tryResolveReady()
      return
    }
    const devId = this.licenseDeviceId || `miniapp-${Date.now()}`
    this.licenseDeviceId = devId
    Taro.setStorageSync('brtc_license_device_id', devId)
    void this.sendSocketData(`[E]:[LIC]:[ACTIVE]:${JSON.stringify({
      devId,
      uId: this.userId || devId,
      licKey: this.licenseKey
    })}`).catch((err) => {
      console.warn('[AiWebSocket] activateLicense failed:', err?.message || err)
      this.licensePassed = true
      this.tryResolveReady()
    })
  }

  private tryResolveReady() {
    if (!this.mediaReady) return
    if (this.licenseRequired && !this.licensePassed) return
    if (!this.licenseRequired && this.licenseKey && !this.licenseWaitTimer) {
      this.licenseWaitTimer = setTimeout(() => {
        this.licenseWaitTimer = null
        if (this.state === 'connecting' && this.mediaReady && !this.licenseRequired) {
          this.resolveReady()
        }
      }, 800)
      return
    }
    this.resolveReady()
  }

  private resolveReady() {
    if (this.state === 'connected') return
    if (this.licenseWaitTimer) clearTimeout(this.licenseWaitTimer)
    this.licenseWaitTimer = null
    this.state = 'connected'
    if (this.metrics) {
      this.metrics.connectReadyMs = Date.now() - this.metrics.startedAt
    }
    this.logMetrics('connected')
    this.sendDeviceInfo()
    this.readyResolve?.()
    this.readyResolve = null
    this.readyReject = null
  }

  private beginRequest(kind: RequestKind, promptLength: number) {
    if (!this.metrics) {
      this.metrics = {
        mode: 'cfg',
        startedAt: Date.now(),
      }
    }
    this.requestStartedAt = Date.now()
    this.metrics.requestKind = kind
    this.metrics.promptLength = promptLength
    this.metrics.sendToFirstInterimMs = undefined
    this.metrics.sendToFinalMs = undefined
    this.metrics.imageUploadMs = undefined
    this.metrics.totalMs = undefined
  }

  private markFirstInterim() {
    if (!this.metrics || !this.requestStartedAt || this.metrics.sendToFirstInterimMs !== undefined) return
    this.metrics.sendToFirstInterimMs = Date.now() - this.requestStartedAt
  }

  private markFinalResponse(status: 'final' | 'timeout') {
    if (this.metrics && this.requestStartedAt) {
      this.metrics.sendToFinalMs = Date.now() - this.requestStartedAt
      this.metrics.totalMs = Date.now() - this.metrics.startedAt
    }
    this.logMetrics(status)
  }

  private logMetrics(status: AiWebSocketMetrics['status']) {
    if (!this.metrics) return
    this.metrics.status = status
    console.info('[AiWebSocket][metrics]', {
      mode: this.metrics.mode,
      status: this.metrics.status,
      requestKind: this.metrics.requestKind,
      promptLength: this.metrics.promptLength,
      wsSignMs: this.metrics.wsSignMs,
      socketOpenMs: this.metrics.socketOpenMs,
      mediaReadyMs: this.metrics.mediaReadyMs,
      connectReadyMs: this.metrics.connectReadyMs,
      sendToFirstInterimMs: this.metrics.sendToFirstInterimMs,
      sendToFinalMs: this.metrics.sendToFinalMs,
      imageUploadMs: this.metrics.imageUploadMs,
      totalMs: this.metrics.totalMs,
    })
  }

  private emit(type: MessageType, data: string | ArrayBuffer) {
    this.listeners.get(type)?.forEach(cb => cb(data))
  }
}

let instance: AiWebSocketService | null = null

export function getAiWebSocket(): AiWebSocketService {
  if (!instance) instance = new AiWebSocketService()
  return instance
}

export type {ConnectOptions, ImageRequestOptions, MessageType, WsCfg }
