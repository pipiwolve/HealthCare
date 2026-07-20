// @title AI健康顾问

import {Image, Textarea} from '@tarojs/components'
import Taro, {useDidHide, useDidShow} from '@tarojs/taro'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {MarkdownRenderer} from '@/components/MarkdownRenderer'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {getRtcHistoryGroups } from '@/db/api'
import type {ChatMessage, ChatSession, RtcHistoryGroup } from '@/db/types'
import {createAiWebSocket, getAiWebSocket} from '@/services/aiWebSocket'
import {useAppStore} from '@/store/appStore'
import {buildChatPrompt} from '@/utils/aiPromptHelpers'
import {buildFamilyHealthContext} from '@/utils/allergenUtils'
import {normalizeAiMarkdown} from '@/utils/markdownText'
import {isPrivacyScopeError, showPrivacyScopeDeclarationTip} from '@/utils/wechatPrivacy'

const VOICE_MESSAGE_PREFIX = '🎙 '
const VOICE_LONG_PRESS_MS = 120
const MIN_VOICE_RECORD_MS = 500

let sharedRtcAudioContext: any = null
let sharedRtcAudioUnlockLogged = false
let rtcAudioKeepaliveSource: any = null
let rtcAudioKeepaliveUntil = 0

function isVoiceMessage(content: string): boolean {
  return content.startsWith(VOICE_MESSAGE_PREFIX)
}

function getVoiceTranscript(content: string): string {
  return isVoiceMessage(content) ? content.slice(VOICE_MESSAGE_PREFIX.length).trim() : content
}

function createLocalChatSession(userId: string, memberId: string | null, title: string): ChatSession {
  const now = new Date().toISOString()
  return {
    id: `local-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    member_id: memberId,
    title: title || '新对话',
    context_data: {},
    created_at: now,
    updated_at: now,
  }
}

function createLocalChatMessage(
  sessionId: string,
  role: ChatMessage['role'],
  content: string,
  imageUrl: string | null = null,
  audioUrl: string | null = null,
): ChatMessage {
  return {
    id: `local-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    session_id: sessionId,
    role,
    content,
    image_url: imageUrl,
    audio_url: audioUrl,
    created_at: new Date().toISOString(),
  }
}

type SendMessageOptions = {
  skipUserBubble?: boolean
  session?: ChatSession
}

function getSharedRtcAudioContext(): any | null {
  const wxApi = (globalThis as any).wx || (Taro as any)
  if (!sharedRtcAudioContext) {
    sharedRtcAudioContext = wxApi?.createWebAudioContext?.() || null
  }
  return sharedRtcAudioContext
}

function unlockRtcAudioPlayback(reason = 'interaction'): boolean {
  const context = getSharedRtcAudioContext()
  if (!context?.createBuffer || !context?.createBufferSource || !context?.destination) return false
  try {
    const resumeResult = context.resume?.()
    if (resumeResult?.catch) {
      void resumeResult.catch((error: unknown) => {
        console.warn('RTC TTS 播放上下文恢复失败:', error)
      })
    }
    const now = Date.now()
    if (!rtcAudioKeepaliveSource || now > rtcAudioKeepaliveUntil - 2000) {
      try {
        rtcAudioKeepaliveSource?.stop?.()
      } catch {}
      rtcAudioKeepaliveSource = null
      const keepaliveSeconds = 45
      const silentBuffer = context.createBuffer(1, 16000 * keepaliveSeconds, 16000)
      const silentSource = context.createBufferSource()
      silentSource.buffer = silentBuffer
      silentSource.connect(context.destination)
      silentSource.onended = () => {
        if (rtcAudioKeepaliveSource === silentSource) rtcAudioKeepaliveSource = null
      }
      silentSource.start(0)
      rtcAudioKeepaliveSource = silentSource
      rtcAudioKeepaliveUntil = now + keepaliveSeconds * 1000
    }
    if (!sharedRtcAudioUnlockLogged) {
      sharedRtcAudioUnlockLogged = true
      console.info('RTC TTS 播放上下文已通过用户手势解锁', {reason})
    }
    return true
  } catch (err: any) {
    console.warn('RTC TTS 播放上下文解锁失败:', err?.message || err)
    return false
  }
}

function ChatPage() {
  const {user} = useAuth()
  const {activeMember, familyMembers, selectedMealMemberIds, isOnline, ingredients} = useAppStore()

  const routeParams = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])

  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [activeRtcGroupId, setActiveRtcGroupId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [inputHeight, setInputHeight] = useState(24)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [rtcHistoryGroups, setRtcHistoryGroups] = useState<RtcHistoryGroup[]>([])
  const [rtcHistoryLoading, setRtcHistoryLoading] = useState(false)
  const [rtcHistoryError, setRtcHistoryError] = useState('')
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isVoicePressing, setIsVoicePressing] = useState(false)
  const [isRecordingCanceling, setIsRecordingCanceling] = useState(false)
  const [useProfile, setUseProfile] = useState(true)
  const [useIngredients, setUseIngredients] = useState(false)
  const recorderManager = useRef<Taro.RecorderManager | null>(null)
  const audioContextRef = useRef<Taro.InnerAudioContext | null>(null)
  const audioMessageIdRef = useRef<string | null>(null)
  const liveAudioPlayerRef = useRef<PcmStreamPlayer | null>(null)
  const activeChatWsRef = useRef<ReturnType<typeof getAiWebSocket> | null>(null)
  const interruptedChatWsRef = useRef<Set<ReturnType<typeof getAiWebSocket>>>(new Set())
  const voiceTouchStartYRef = useRef(0)
  const voiceCancelRef = useRef(false)
  const voicePressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voicePressingRef = useRef(false)
  const voiceRecordStartingRef = useRef(false)
  const voiceRecordStartedAtRef = useRef(0)
  const [voiceMode, setVoiceMode] = useState(false)
  const voiceSessionRef = useRef<ChatSession | null>(null)

  const loadRtcHistory = useCallback(async () => {
    if (!user) return
    setRtcHistoryLoading(true)
    setRtcHistoryError('')

    try {
      const data = await getRtcHistoryGroups()
      setRtcHistoryGroups(data)
    } catch (err: any) {
      console.error('加载 RTC 云端历史失败:', err?.message || err)
      setRtcHistoryError(err?.message || 'RTC 云端历史加载失败')
    } finally {
      setRtcHistoryLoading(false)
    }
  }, [user])

  useDidShow(() => {
    if (showDrawer) void loadRtcHistory()
  })
  useDidHide(() => {
    setShowDrawer(false)
  })

  useEffect(() => {
    if (showDrawer) void loadRtcHistory()
  }, [loadRtcHistory, showDrawer])

  useEffect(() => {
    return () => {
      if (voicePressTimerRef.current) clearTimeout(voicePressTimerRef.current)
      audioContextRef.current?.destroy()
      audioContextRef.current = null
      liveAudioPlayerRef.current?.stop()
      liveAudioPlayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const handler = (res: any) => {
      if ((res?.height || 0) <= 0) return
      setTimeout(() => {
        const el = scrollContainerRef.current as any
        try { if (el) el.scrollTop = el.scrollHeight } catch {}
      }, 80)
    }
    Taro.onKeyboardHeightChange?.(handler)
    return () => {
      Taro.offKeyboardHeightChange?.(handler)
    }
  }, [])

  const contextConsumedRef = useRef(false)

  // 处理从外部跳转传入的上下文；storage 方式避免 URL 超长，并防止重复消费。
  useEffect(() => {
    if (!user || contextConsumedRef.current) return
    const from = routeParams.from as string | undefined
    if (from === 'recipe' || from === 'analysis') {
      contextConsumedRef.current = true
      try {
        const raw = Taro.getStorageSync('_chatContext')
        Taro.removeStorageSync('_chatContext')
        if (raw) {
          const ctx = JSON.parse(raw)
          setUseIngredients(true)
          handleNewSession(ctx)
        }
      } catch {}
    } else if (routeParams.context) {
      contextConsumedRef.current = true
      try {
        const ctx = JSON.parse(decodeURIComponent(routeParams.context as string))
        setUseIngredients(true)
        handleNewSession(ctx)
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleNewSession = async (contextData?: object) => {
    if (!user) return
    setActiveSession(null)
    setActiveRtcGroupId(null)
    setMessages([])
    setInputText('')
    setInputHeight(24)
    if (contextData) setUseIngredients(true)
  }

  const handleSelectRtcHistory = (group: RtcHistoryGroup) => {
    setActiveSession(null)
    setActiveRtcGroupId(group.id)
    setMessages(group.messages.map((message, index) => ({
      id: `${group.id}-${index}`,
      session_id: group.id,
      role: message.role,
      content: message.content,
      image_url: null,
      audio_url: null,
      created_at: new Date(message.timestamp * 1000).toISOString(),
    })))
    setShowDrawer(false)
  }

  const sendMessage = async (content: string, options?: SendMessageOptions) => {
    if (!content.trim()) return
    if (!isOnline) {
      Taro.showToast({title: '需要网络连接', icon: 'none'})
      return
    }

    const displayContent = content
    const promptContent = getVoiceTranscript(content)
    let session = options?.session || activeSession
    if (!session) {
      session = createLocalChatSession(user!.id, activeMember?.id || null, promptContent.slice(0, 20) || '新对话')
      setActiveSession(session)
    }
    setActiveRtcGroupId(null)

    if (!options?.skipUserBubble) {
      setMessages(prev => [...prev, createLocalChatMessage(session.id, 'user', displayContent)])
    }
    setInputText('')
    setInputHeight(24)
    setIsLoading(true)
    let requestWs: ReturnType<typeof getAiWebSocket> | null = null

    try {
      let healthContext = ''
      if (useProfile) {
        const selectedMembers = familyMembers.filter(member => selectedMealMemberIds.includes(member.id))
        const contextMembers = selectedMembers.length > 0 ? selectedMembers : (activeMember ? [activeMember] : [])
        healthContext = buildFamilyHealthContext(contextMembers)
      }
      let ingredientContext = ''
      if (useIngredients && ingredients.length > 0) {
        const selectedMembers = familyMembers.filter(member => selectedMealMemberIds.includes(member.id))
        const contextMembers = selectedMembers.length > 0 ? selectedMembers : (activeMember ? [activeMember] : [])
        const memberText = contextMembers.length > 0
          ? `本餐用餐成员：${contextMembers.map(member => member.nickname).join('、')}；`
          : ''
        ingredientContext = `${memberText}当前称重食材：${ingredients.map(i => `${i.name}${i.weight}${i.unit}`).join('、')}`
      }

      const fullPrompt = buildChatPrompt({
        userQuestion: promptContent,
        healthContext,
        ingredientContext
      })

      const ws = getAiWebSocket()
      requestWs = ws
      activeChatWsRef.current = ws
      let aiReply = ''
      const streamingAiId = `streaming-ai-${Date.now()}`
      const audioChunks: ArrayBuffer[] = []
      let streamingAudioUrl: string | null = null
      let audioWritePromise: Promise<string | null> | null = null
      let ttsEnded = false
      liveAudioPlayerRef.current?.stop()
      liveAudioPlayerRef.current = null
      const liveAudioPlayer = createPcmStreamPlayer()
      liveAudioPlayerRef.current = liveAudioPlayer
      const createStreamingAiMessage = () => {
        setMessages(prev => prev.some(m => m.id === streamingAiId) ? prev : [...prev, {
          id: streamingAiId,
          session_id: session.id,
          role: 'assistant',
          content: '',
          image_url: null,
          audio_url: null,
          created_at: new Date().toISOString(),
        }])
      }
      const updateStreamingAiMessage = (text: string) => {
        setMessages(prev => prev.map(m => m.id === streamingAiId ? {...m, content: normalizeAiMarkdown(text)} : m))
      }
      const attachAudioToStreamingMessage = async () => {
        if (streamingAudioUrl) return streamingAudioUrl
        if (audioWritePromise) return audioWritePromise
        audioWritePromise = writeAudioChunksToTempFile(audioChunks).then((url) => {
          streamingAudioUrl = url
          if (url) {
            setMessages(prev => prev.map(m => m.id === streamingAiId ? {...m, audio_url: url} : m))
          }
          return url
        })
        return audioWritePromise
      }
      try {
        await ws.connect({mode: 'default', agentProfile: 'chat', userId: user!.id})
        createStreamingAiMessage()
        aiReply = await ws.requestResponse(fullPrompt, {
          onInterim: updateStreamingAiMessage,
          onAudio: (buffer) => {
            audioChunks.push(buffer)
            liveAudioPlayer?.append(buffer)
          },
          onTtsEnd: () => {
            ttsEnded = true
            liveAudioPlayer?.finish()
            void attachAudioToStreamingMessage()
          }
        })
        if (!streamingAudioUrl && (ttsEnded || audioChunks.length > 0)) {
          streamingAudioUrl = await attachAudioToStreamingMessage()
        }
      } finally {
        ws.disconnect()
        if (liveAudioPlayerRef.current === liveAudioPlayer) {
          liveAudioPlayer?.finish()
          liveAudioPlayerRef.current = null
        }
      }

      const aiMsg = createLocalChatMessage(
        session.id,
        'assistant',
        normalizeAiMarkdown(aiReply) || '抱歉，我暂时无法回答您的问题，请稍后重试。',
        null,
        streamingAudioUrl,
      )
      setMessages(prev => {
        const hasStreamingMessage = prev.some(m => m.id === streamingAiId)
        if (!hasStreamingMessage) return [...prev, aiMsg]
        return prev.map(m => m.id === streamingAiId ? aiMsg : m)
      })
    } catch (err: any) {
      const wasInterrupted = requestWs ? interruptedChatWsRef.current.has(requestWs) : false
      if (wasInterrupted) {
        if (requestWs) interruptedChatWsRef.current.delete(requestWs)
        console.info('AI 回复已被用户语音输入打断')
      } else {
        console.error('AI回复失败详情:', err?.message || err, err)
        Taro.showToast({title: 'AI回复失败，请重试', icon: 'none'})
      }
    } finally {
      if (requestWs && activeChatWsRef.current === requestWs) {
        activeChatWsRef.current = null
      }
      setIsLoading(false)
    }
  }

  const readAudioAsBase64 = (filePath: string): Promise<{base64: string; size: number}> => {
    return new Promise((resolve, reject) => {
      const fs = Taro.getFileSystemManager()
      fs.getFileInfo({
        filePath,
        success: (info) => {
          fs.readFile({
            filePath,
            encoding: 'base64',
            success: (res) => resolve({base64: res.data as string, size: info.size}),
            fail: reject
          })
        },
        fail: reject
      })
    })
  }

  const writeAudioChunksToTempFile = async (chunks: ArrayBuffer[]): Promise<string | null> => {
    if (chunks.length === 0) return null
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    if (totalLength < 256) return null
    const bytes = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(new Uint8Array(chunk), offset)
      offset += chunk.byteLength
    }
    if (!Taro.env.USER_DATA_PATH) return null
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    const isMp3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
    const audioData = isWav || isMp3 ? bytes : wrapPcm16ToWav(bytes)
    const ext = isMp3 ? 'mp3' : 'wav'
    const filePath = `${Taro.env.USER_DATA_PATH}/rtc-tts-${Date.now()}.${ext}`
    return new Promise((resolve) => {
      Taro.getFileSystemManager().writeFile({
        filePath,
        data: audioData.buffer,
        success: () => resolve(filePath),
        fail: (err) => {
          console.warn('写入 RTC TTS 音频失败:', err?.errMsg || err)
          resolve(null)
        }
      })
    })
  }

  const writePcmVoiceToWavFile = async (buffer: ArrayBuffer): Promise<string | null> => {
    if (!Taro.env.USER_DATA_PATH || buffer.byteLength < 256) return null
    const bytes = new Uint8Array(buffer)
    const wav = wrapPcm16ToWav(bytes)
    const filePath = `${Taro.env.USER_DATA_PATH}/voice-message-${Date.now()}.wav`
    return new Promise((resolve) => {
      Taro.getFileSystemManager().writeFile({
        filePath,
        data: wav.buffer,
        success: () => resolve(filePath),
        fail: (err) => {
          console.warn('写入语音消息音频失败:', err?.errMsg || err)
          resolve(null)
        }
      })
    })
  }

  const wrapPcm16ToWav = (pcm: Uint8Array) => {
    const sampleRate = 16000
    const channels = 1
    const bitsPerSample = 16
    const headerSize = 44
    const wav = new Uint8Array(headerSize + pcm.byteLength)
    const view = new DataView(wav.buffer)
    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) wav[offset + i] = value.charCodeAt(i)
    }
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + pcm.byteLength, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true)
    view.setUint16(32, channels * bitsPerSample / 8, true)
    view.setUint16(34, bitsPerSample, true)
    writeString(36, 'data')
    view.setUint32(40, pcm.byteLength, true)
    wav.set(pcm, headerSize)
    return wav
  }

  const stopCurrentAudio = useCallback(() => {
    audioContextRef.current?.stop()
    audioContextRef.current?.destroy()
    audioContextRef.current = null
    audioMessageIdRef.current = null
    setPlayingAudioId(null)
  }, [])

  const interruptActiveChatResponse = useCallback((reason = 'voice-input') => {
    const ws = activeChatWsRef.current
    if (ws) {
      interruptedChatWsRef.current.add(ws)
      activeChatWsRef.current = null
      ws.disconnect()
    }
    liveAudioPlayerRef.current?.stop()
    liveAudioPlayerRef.current = null
    setIsLoading(false)
    console.info('已打断当前 AI/TTS 回复', {reason})
  }, [])

  const handlePlayAudio = useCallback((msg: ChatMessage) => {
    if (!msg.audio_url) return
    unlockRtcAudioPlayback('audio-button')
    try {
      if (msg.audio_url.startsWith(Taro.env.USER_DATA_PATH || '')) {
        const stat = Taro.getFileSystemManager().statSync(msg.audio_url) as Taro.Stats
        if (!stat?.size || stat.size < 256) {
          Taro.showToast({title: '朗读音频不可用', icon: 'none'})
          return
        }
      }
    } catch {
      Taro.showToast({title: '朗读音频不可用', icon: 'none'})
      return
    }
    if (audioMessageIdRef.current === msg.id && playingAudioId === msg.id) {
      stopCurrentAudio()
      return
    }
    stopCurrentAudio()
    const ctx = Taro.createInnerAudioContext()
    audioContextRef.current = ctx
    audioMessageIdRef.current = msg.id
    ctx.src = msg.audio_url
    ctx.onEnded(() => {
      if (audioMessageIdRef.current === msg.id) {
        audioMessageIdRef.current = null
        audioContextRef.current?.destroy()
        audioContextRef.current = null
        setPlayingAudioId(null)
      }
    })
    ctx.onError((err) => {
      console.warn('播放音频失败:', err?.errMsg || err)
      if (audioMessageIdRef.current === msg.id) {
        audioMessageIdRef.current = null
        audioContextRef.current?.destroy()
        audioContextRef.current = null
        setPlayingAudioId(null)
      }
      Taro.showToast({title: '朗读播放失败', icon: 'none'})
    })
    setPlayingAudioId(msg.id)
    ctx.play()
  }, [playingAudioId, stopCurrentAudio])

  const handleCopyMessage = useCallback((content: string) => {
    Taro.setClipboardData({
      data: content,
      fail: (err) => {
        if (isPrivacyScopeError(err)) {
          console.warn('复制内容隐私配置缺失:', err)
          showPrivacyScopeDeclarationTip('剪贴板')
          return
        }
        Taro.showToast({title: '复制失败', icon: 'none'})
      }
    })
  }, [])

  const ensureSession = useCallback(async (title: string): Promise<ChatSession | null> => {
    if (voiceSessionRef.current) return voiceSessionRef.current
    if (activeSession) { voiceSessionRef.current = activeSession; return activeSession }
    const s = createLocalChatSession(user!.id, activeMember?.id || null, title)
    setActiveSession(s)
    setActiveRtcGroupId(null)
    voiceSessionRef.current = s
    return s
  }, [activeSession, activeMember, user])

  const ensureRecordPermission = useCallback((): Promise<boolean> => {
    const showSettingGuide = () => {
      Taro.showModal({
        title: '需要麦克风权限',
        content: '请前往设置页开启麦克风权限后再使用语音输入',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => { if (res.confirm) Taro.openSetting() }
      })
    }

    return new Promise((resolve) => {
      Taro.getSetting({
        success: (settingRes: any) => {
          const status = settingRes?.authSetting?.['scope.record']
          if (status === true) {
            resolve(true)
          } else if (status === false) {
            showSettingGuide()
            resolve(false)
          } else {
            Taro.authorize({
              scope: 'scope.record',
              success: () => resolve(true),
              fail: () => {
                showSettingGuide()
                resolve(false)
              }
            })
          }
        },
        fail: () => {
          Taro.authorize({
            scope: 'scope.record',
            success: () => resolve(true),
            fail: () => {
              showSettingGuide()
              resolve(false)
            }
          })
        }
      })
    })
  }, [])

  const startVoiceRecording = useCallback(async () => {
    if (isRecording || voiceRecordStartingRef.current) return
    voiceRecordStartingRef.current = true
    if (!await ensureRecordPermission()) {
      voiceRecordStartingRef.current = false
      return
    }
    if (!voicePressingRef.current) {
      voiceRecordStartingRef.current = false
      return
    }

    const doStartRecord = () => {
      const rm = Taro.getRecorderManager()
      recorderManager.current = rm
      voiceCancelRef.current = false
      setIsRecordingCanceling(false)
      rm.onStart(() => {
        voiceRecordStartingRef.current = false
        if (!voicePressingRef.current) {
          recorderManager.current?.stop()
          return
        }
        voiceRecordStartedAtRef.current = Date.now()
        setIsRecording(true)
      })
      rm.onStop(async (res) => {
        voiceRecordStartingRef.current = false
        setIsRecording(false)
        setIsVoicePressing(false)
        setIsRecordingCanceling(false)
        if (voiceCancelRef.current) {
          voiceCancelRef.current = false
          voiceRecordStartedAtRef.current = 0
          Taro.showToast({title: '已取消发送', icon: 'none'})
          return
        }
        if (!res.tempFilePath) return
        const recordDurationMs = voiceRecordStartedAtRef.current ? Date.now() - voiceRecordStartedAtRef.current : 0
        voiceRecordStartedAtRef.current = 0
        if (recordDurationMs < MIN_VOICE_RECORD_MS) {
          Taro.showToast({title: '说话时间太短', icon: 'none'})
          return
        }
        const ws = createAiWebSocket()
        const session = await ensureSession('语音对话')
        if (!session) return
        const placeholder = createLocalChatMessage(session.id, 'user', `${VOICE_MESSAGE_PREFIX}正在识别...`)
        setMessages(prev => [...prev, placeholder])
        try {
          const {base64} = await readAudioAsBase64(res.tempFilePath)
          const buffer = Taro.base64ToArrayBuffer(base64)
          const playableVoiceUrl = await writePcmVoiceToWavFile(buffer)
          if (playableVoiceUrl) {
            setMessages(prev => prev.map(message => message.id === placeholder.id ? {...message, audio_url: playableVoiceUrl} : message))
          }
          await ws.connect({mode: 'default', agentProfile: 'voice-ptt', userId: user!.id})
          const text = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => { unsub(); reject(new Error('timeout')) }, 15000)
            const unsub = ws.onMessage('asr-final', (data) => {
              clearTimeout(timeout)
              unsub()
              resolve(data as string)
            })
            void (async () => {
              await ws.sendControl('[E]:[CMD]:[ASR_DISABLE_REALTIME]')
              await ws.sendControl('[E]:[CMD]:[ASR_START_LONGTEXT_REC]')
              await ws.sendAudio(buffer)
              await ws.sendControl('[E]:[CMD]:[ASR_STOP_LONGTEXT_REC]')
            })().catch((error) => {
              clearTimeout(timeout)
              unsub()
              reject(error)
            })
          })
          if (text.trim()) {
            const voiceContent = `${VOICE_MESSAGE_PREFIX}${text.trim()}`
            setMessages(prev => prev.map(message => message.id === placeholder.id ? {...message, content: voiceContent} : message))
            ws.disconnect()
            await new Promise(resolve => setTimeout(resolve, 120))
            await sendMessage(voiceContent, {skipUserBubble: true, session})
          } else {
            setMessages(prev => prev.filter(message => message.id !== placeholder.id))
            Taro.showToast({title: '语音识别失败，请重试', icon: 'none'})
          }
        } catch {
          setMessages(prev => prev.filter(message => message.id !== placeholder.id))
          Taro.showToast({title: '语音识别失败，请重试', icon: 'none'})
        } finally {
          ws.disconnect()
        }
      })
      rm.start({duration: 10000, format: 'PCM' as any, sampleRate: 16000, numberOfChannels: 1, frameSize: 640})
    }

    doStartRecord()
  }, [ensureRecordPermission, ensureSession, isRecording, sendMessage, user])

  const handleVoiceTouchStart = useCallback((event: any) => {
    unlockRtcAudioPlayback('voice-touch')
    if (isLoading) interruptActiveChatResponse('voice-touch')
    voiceTouchStartYRef.current = event?.touches?.[0]?.clientY || 0
    voiceCancelRef.current = false
    voicePressingRef.current = true
    setIsVoicePressing(true)
    setIsRecordingCanceling(false)
    if (voicePressTimerRef.current) clearTimeout(voicePressTimerRef.current)
    voicePressTimerRef.current = setTimeout(() => {
      voicePressTimerRef.current = null
      void startVoiceRecording()
    }, VOICE_LONG_PRESS_MS)
  }, [interruptActiveChatResponse, isLoading, startVoiceRecording])

  const handleVoiceTouchMove = useCallback((event: any) => {
    if (!isRecording) return
    const currentY = event?.touches?.[0]?.clientY || voiceTouchStartYRef.current
    const shouldCancel = voiceTouchStartYRef.current - currentY > 48
    voiceCancelRef.current = shouldCancel
    setIsRecordingCanceling(shouldCancel)
  }, [isRecording])

  const handleVoiceTouchEnd = useCallback(() => {
    voicePressingRef.current = false
    setIsVoicePressing(false)
    if (voicePressTimerRef.current) {
      clearTimeout(voicePressTimerRef.current)
      voicePressTimerRef.current = null
      setIsRecordingCanceling(false)
      return
    }
    recorderManager.current?.stop()
  }, [])

  const handleSend = () => {
    if (isLoading || !inputText.trim()) return
    unlockRtcAudioPlayback('send-button')
    void sendMessage(inputText)
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const hasStreamingAiMessage = messages.some(msg => msg.id.startsWith('streaming-ai-'))

  useEffect(() => {
    if (!scrollContainerRef.current) return
    const el = scrollContainerRef.current as any
    setTimeout(() => {
      try { el.scrollTop = el.scrollHeight } catch {}
    }, 50)
  }, [messages, isLoading])

  const inputBarHeight = 68
  const messageBottomPadding = inputBarHeight + 24
  const formatRtcClock = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const formatRtcGroupTime = (group: RtcHistoryGroup) => {
    const start = new Date(group.startTime * 1000)
    const end = new Date(group.endTime * 1000)
    const date = end.toLocaleDateString('zh-CN', {month: '2-digit', day: '2-digit'})
    if (start.toDateString() === end.toDateString()) {
      return `${date} ${formatRtcClock(group.startTime)}-${formatRtcClock(group.endTime)}`
    }
    return `${date} 截止 ${formatRtcClock(group.endTime)}`
  }
  const hasAnyHistory = rtcHistoryGroups.length > 0
  const isVoiceButtonActive = isRecording || isVoicePressing

  return (
    <div className="w-full h-screen flex flex-col bg-background overflow-x-hidden" onTouchStart={() => unlockRtcAudioPlayback('chat-page-touch')}>
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{width: '44px', height: '44px'}}
          onClick={() => setShowDrawer(true)}
        >
          <div className="i-mdi-menu text-2xl" style={{color: '#333333'}} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-semibold text-foreground">AI健康顾问</p>
          {activeRtcGroupId ? (
            <p className="text-xl text-muted-foreground">云端历史</p>
          ) : activeSession ? (
            <p className="text-xl text-muted-foreground" style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
              {activeSession.title}
            </p>
          ) : activeMember ? (
            <p className="text-xl text-muted-foreground">{activeMember.nickname}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="flex-shrink-0 flex items-center justify-center leading-none gap-1 text-xl text-primary border border-primary rounded-xl px-3"
          style={{height: '36px'}}
          onClick={() => handleNewSession()}
        >
          <div className="i-mdi-plus text-xl" />
          <span>新对话</span>
        </button>
      </div>

      {/* 上下文开关（无消息时显示） */}
      {messages.length === 0 && (
        <div className="px-4 py-3 bg-secondary/50 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2" onClick={() => setUseProfile(!useProfile)}>
              <div
                className="relative flex-shrink-0 rounded-full transition-colors duration-200"
                style={{width: '40px', height: '22px', backgroundColor: useProfile ? '#4A7C59' : '#DDDDDD'}}
              >
                <div
                  className="absolute top-0.5 bg-white rounded-full shadow transition-all duration-200"
                  style={{width: '18px', height: '18px', left: useProfile ? '20px' : '2px'}}
                />
              </div>
              <span className="text-xl text-foreground">使用健康档案</span>
            </div>
            <div className="flex items-center gap-2" onClick={() => setUseIngredients(!useIngredients)}>
              <div
                className="relative flex-shrink-0 rounded-full transition-colors duration-200"
                style={{width: '40px', height: '22px', backgroundColor: useIngredients ? '#4A7C59' : '#DDDDDD'}}
              >
                <div
                  className="absolute top-0.5 bg-white rounded-full shadow transition-all duration-200"
                  style={{width: '18px', height: '18px', left: useIngredients ? '20px' : '2px'}}
                />
              </div>
              <span className="text-xl text-foreground">使用当前食材</span>
            </div>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{paddingBottom: `${messageBottomPadding}px`}}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-8 gap-3">
            <div className="w-16 h-16 bg-gradient-primary rounded-3xl flex items-center justify-center">
              <div className="i-mdi-robot-happy text-4xl text-white" />
            </div>
            <p className="text-2xl font-semibold text-foreground">AI健康顾问</p>
            <p className="text-xl text-muted-foreground text-center px-6">有任何饮食健康问题都可以向我咨询</p>
            <div className="flex flex-wrap gap-2 w-full mt-2">
              {[
                '今天吃什么比较健康？',
                '高血压应注意哪些饮食禁忌？',
                '如何合理搭配蛋白质来源？',
                '怎么减少碳水化合物摄入？',
                '什么食物有助于控制血糖？',
              ].map(q => (
                <div
                  key={q}
                  className="px-4 py-2 rounded-[20px] text-xl text-foreground"
                  style={{backgroundColor: '#F2F2F2'}}
                  onTouchStart={() => unlockRtcAudioPlayback('suggestion-touch')}
                  onClick={() => {
                    unlockRtcAudioPlayback('suggestion')
                    sendMessage(q)
                  }}
                >
                  {q}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 bg-gradient-primary rounded-xl flex items-center justify-center flex-shrink-0 mb-1">
                    <div className="i-mdi-robot text-xl text-white" />
                  </div>
                )}
                <div className="flex flex-col items-start" style={{maxWidth: '75%'}}>
                  <div
                    className={`rounded-2xl px-4 py-3 w-full ${
                      msg.role === 'user' ? 'text-white rounded-br-[4px]' : 'rounded-bl-[4px]'
                    }`}
                    style={{
                      backgroundColor: msg.role === 'user' ? '#4A7C59' : '#F2F2F2',
                      color: msg.role === 'user' ? '#ffffff' : '#333333',
                    }}
                  >
                    {msg.role === 'user' ? (
                      <div className="flex flex-col gap-2">
                        {msg.image_url && (
                          <div className="rounded-xl overflow-hidden" style={{maxWidth: '200px'}}>
                            <Image
                              src={msg.image_url}
                              mode="widthFix"
                              style={{width: '100%', borderRadius: '10px', display: 'block'}}
                            />
                          </div>
                        )}
                        {isVoiceMessage(msg.content) ? (
                          <div
                            className="flex items-center gap-3 active:opacity-80"
                          style={{minWidth: '168px'}}
                          onClick={() => handlePlayAudio(msg)}
                          >
                            <div className="flex items-center justify-center rounded-full flex-shrink-0"
                              style={{width: '30px', height: '30px', backgroundColor: 'rgba(255,255,255,0.18)'}}>
                              <div className={`${playingAudioId === msg.id ? 'i-mdi-pause' : 'i-mdi-play'} text-xl text-white`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="flex items-end gap-0.5 flex-shrink-0" style={{height: '16px'}}>
                                  {[0,1,2,3,4].map(i => (
                                    <div key={i} className="rounded-full bg-white/85 animate-soundwave"
                                      style={{width: '3px', height: `${5 + (i % 3) * 4}px`, animationDelay: `${i * 0.1}s`}} />
                                  ))}
                                </div>
                                <span style={{fontSize: '11px', color: 'rgba(255,255,255,0.72)'}}>语音消息</span>
                              </div>
                              <p className="mt-1" style={{fontSize: '11px', lineHeight: '14px', color: 'rgba(255,255,255,0.72)'}}>
                                {msg.audio_url ? (playingAudioId === msg.id ? '正在播放' : '点击播放') : '正在处理'}
                              </p>
                            </div>
                          </div>
                        ) : (
                          msg.content && <p className="text-xl leading-relaxed">{msg.content}</p>
                        )}
                      </div>
                    ) : (
                      <MarkdownRenderer content={msg.content} className="text-foreground" />
                    )}
                  </div>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        className="flex items-center justify-center leading-none gap-1 px-2 active:opacity-60"
                        style={{height: '24px'}}
                        onClick={() => handleCopyMessage(msg.content)}
                      >
                        <div className="i-mdi-content-copy text-xl text-muted-foreground" />
                        <span className="text-muted-foreground" style={{fontSize: '11px'}}>复制</span>
                      </button>
                      {msg.audio_url && (
                        <button
                          type="button"
                          className="flex items-center justify-center leading-none gap-1 px-2 active:opacity-60"
                          style={{height: '24px'}}
                          onTouchStart={() => unlockRtcAudioPlayback('assistant-audio-touch')}
                          onClick={() => handlePlayAudio(msg)}
                        >
                          <div className={`${playingAudioId === msg.id ? 'i-mdi-pause-circle-outline' : 'i-mdi-volume-high'} text-xl text-muted-foreground`} />
                          <span className="text-muted-foreground" style={{fontSize: '11px'}}>
                            {playingAudioId === msg.id ? '暂停' : '朗读'}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && !hasStreamingAiMessage && (
              <div className="flex items-end gap-2 justify-start">
                <div className="w-8 h-8 bg-gradient-primary rounded-xl flex items-center justify-center flex-shrink-0 mb-1">
                  <div className="i-mdi-robot text-xl text-white" />
                </div>
                <div className="rounded-2xl rounded-bl-[4px] px-4 py-4" style={{backgroundColor: '#F2F2F2'}}>
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-primary rounded-full animate-breathe" style={{animationDelay: `${i * 0.2}s`}} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="pt-4 pb-2 text-center" style={{fontSize: '10px', color: '#999999'}}>
          本分析结果仅供参考，不能替代专业医生或营养师诊断
        </div>
      </div>

      {/* 输入区 */}
      <div
        className="flex-shrink-0 border-t border-border fixed left-0 right-0"
        style={{
          padding: '8px 12px',
          bottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '0',
          zIndex: 50,
          transform: 'translateZ(0)',
          backgroundColor: '#F7F7F7'
        }}
      >
        {voiceMode ? (
          <div className="flex items-center gap-3">
            <button type="button" className="flex-shrink-0 flex items-center justify-center"
              style={{width: '44px', height: '44px'}} onClick={() => setVoiceMode(false)}>
              <div className="i-mdi-keyboard text-2xl text-muted-foreground" />
            </button>
            <div
              className="flex-1 flex items-center justify-center border transition-colors"
              style={{
                height: '44px',
                borderRadius: '6px',
                position: 'relative',
                overflow: 'hidden',
                borderColor: isVoiceButtonActive ? (isRecordingCanceling ? '#F97316' : '#EF4444') : 'hsl(var(--border))',
                backgroundColor: isVoiceButtonActive ? (isRecordingCanceling ? '#FFF7ED' : '#EF4444') : '#FFFFFF',
              }}
              onTouchStart={handleVoiceTouchStart}
              onTouchMove={handleVoiceTouchMove}
              onTouchCancel={handleVoiceTouchEnd}
              onTouchEnd={handleVoiceTouchEnd}
            >
              {isVoiceButtonActive ? (
                <>
                {!isRecordingCanceling && (
                  <>
                    <div className="absolute rounded-full" style={{
                      width: '120px',
                      height: '120px',
                      border: '1px solid rgba(255,255,255,0.45)',
                      animation: 'voiceRipple 1.15s ease-out infinite',
                    }} />
                    <div className="absolute rounded-full" style={{
                      width: '120px',
                      height: '120px',
                      border: '1px solid rgba(255,255,255,0.32)',
                      animation: 'voiceRipple 1.15s ease-out infinite',
                      animationDelay: '0.36s',
                    }} />
                  </>
                )}
                <div className="flex items-center gap-2">
                    <div className={`i-mdi-microphone text-xl ${isRecordingCanceling ? 'text-orange-500' : 'text-white'}`} />
                    <span className={`text-xl ${isRecordingCanceling ? 'text-orange-500' : 'text-white'}`}>
                      {isRecordingCanceling ? '松手取消' : (isRecording ? '录音中...' : '准备录音...')}
                    </span>
                    <div className="flex items-end gap-0.5" style={{height: '16px'}}>
                      {[0,1,2,3,4].map(i => (
                        <div key={i} className={`rounded-full animate-soundwave ${isRecordingCanceling ? 'bg-orange-500' : 'bg-white'}`}
                          style={{width: '3px', height: `${5 + (i % 3) * 4}px`, animationDelay: `${i * 0.1}s`}} />
                      ))}
                    </div>
                </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="i-mdi-microphone text-xl text-muted-foreground" />
                  <span className="text-xl text-muted-foreground">按住说话</span>
                </div>
              )}
            </div>
          </div>
        ) : (
            <div className="flex items-end" style={{gap: '8px'}}>
              <button type="button" className="flex-shrink-0 flex items-center justify-center"
                style={{width: '44px', height: '44px'}}
                onTouchStart={() => unlockRtcAudioPlayback('voice-mode-touch')}
                onClick={() => setVoiceMode(true)}>
                <div className="i-mdi-microphone text-2xl text-muted-foreground" />
              </button>
              <div className="flex items-center bg-white"
                style={{flex: 1, minWidth: 0, borderRadius: '6px', border: '1px solid #E5E5E5', minHeight: '44px', padding: '10px 12px'}}>
                <Textarea
                  className="flex-1 text-xl bg-transparent outline-none leading-normal"
                  placeholder="输入健康问题..."
                  placeholderStyle="line-height:24px;color:#999999;"
                  value={inputText}
                  adjustPosition={false}
                  showConfirmBar={false}
                  cursorSpacing={16}
                  style={{minWidth: 0, height: `${inputHeight}px`, maxHeight: '96px', resize: 'none', color: '#333333', lineHeight: '24px', display: 'block', overflowY: 'hidden', padding: 0, boxSizing: 'border-box'}}
                  onKeyboardHeightChange={(e) => setKeyboardHeight(Math.max(0, Number((e as any).detail?.height || 0)))}
                  onBlur={() => setKeyboardHeight(0)}
                  onInput={(e) => {
                    const ev = e as any
                    const nextValue = ev.detail?.value ?? ev.target?.value ?? ''
                    setInputText(nextValue)
                    const lineCount = Math.min(Math.max(nextValue.split('\n').length, 1), 4)
                    setInputHeight(Math.min(96, lineCount * 24))
                  }}
                />
              </div>
              <button
                type="button"
                className="flex-shrink-0 flex items-center justify-center leading-none rounded-full transition-colors duration-200"
                style={{width: '44px', height: '44px', backgroundColor: inputText.trim() && !isLoading ? '#4A7C59' : '#E5E5E5'}}
                onTouchStart={() => unlockRtcAudioPlayback('send-button-touch')}
                onClick={handleSend}
              >
                <div className="i-mdi-arrow-up text-2xl"
                  style={{color: inputText.trim() && !isLoading ? '#ffffff' : '#999999'}} />
              </button>
            </div>
        )}
      </div>

      {/* 历史对话面板 */}
      {showDrawer && (
        <div className="fixed inset-0" style={{zIndex: 9999}}>
          <div
            className="absolute inset-0"
            style={{backgroundColor: 'rgba(0,0,0,0.3)'}}
            onClick={() => setShowDrawer(false)}
          />
          <div
            className="absolute left-0 right-0 bottom-0 bg-white flex flex-col"
            style={{height: '60vh', borderRadius: '16px 16px 0 0'}}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="rounded-full" style={{width: '40px', height: '4px', backgroundColor: '#DDDDDD'}} />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <div>
                <p className="text-2xl font-semibold text-foreground">对话历史</p>
                <p className="text-xl text-muted-foreground mt-1">RTC 云端记录，按 30 分钟自动分段</p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="flex items-center justify-center leading-none gap-1 text-xl font-medium text-primary border border-primary rounded-lg px-3 active:bg-primary/10 transition"
                  style={{height: '32px'}}
                  onClick={() => void loadRtcHistory()}
                >
                  <div className={`i-mdi-refresh text-xl ${rtcHistoryLoading ? 'animate-spin' : ''}`} />
                  <span>刷新</span>
                </button>
                <div className="i-mdi-close text-2xl text-muted-foreground" onClick={() => setShowDrawer(false)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {rtcHistoryLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="i-mdi-loading text-5xl text-muted-foreground" style={{animation: 'spin 1s linear infinite'}} />
                  <p className="text-xl text-muted-foreground">正在加载 RTC 云端历史...</p>
                </div>
              ) : rtcHistoryError ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 px-6">
                  <div className="i-mdi-alert-circle-outline text-5xl text-muted-foreground" />
                  <p className="text-xl text-muted-foreground text-center">{rtcHistoryError}</p>
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none text-xl font-medium text-primary border border-primary rounded-lg px-4 active:bg-primary/10 transition"
                    style={{height: '36px'}}
                    onClick={() => void loadRtcHistory()}
                  >
                    重试
                  </button>
                </div>
              ) : !hasAnyHistory ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="i-mdi-chat-outline text-5xl text-muted-foreground" />
                  <p className="text-xl text-muted-foreground">暂无 RTC 云端对话历史</p>
                </div>
              ) : (
                <>
                  {rtcHistoryGroups.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-secondary/60 border-b border-border">
                        <p className="text-xl font-semibold text-foreground">最近 10 个历史对话</p>
                      </div>
                      {rtcHistoryGroups.map(group => (
                  <div
                    key={group.id}
                    className={`flex items-center gap-3 px-4 border-b border-border ${activeRtcGroupId === group.id ? 'bg-primary/10' : ''}`}
                    style={{minHeight: '56px'}}
                    onClick={() => handleSelectRtcHistory(group)}
                  >
                    <div className="i-mdi-cloud-outline text-xl text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-medium text-foreground" style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                        {group.title}
                      </p>
                      <p className="text-xl text-muted-foreground">
                        {formatRtcGroupTime(group)}
                      </p>
                    </div>
                    <div className="i-mdi-chevron-right text-2xl text-muted-foreground flex-shrink-0" />
                  </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-4 pt-3 pb-tabbar flex-shrink-0">
              <button
                type="button"
                className="w-full flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl"
                style={{height: '52px'}}
                onClick={() => { handleNewSession(); setShowDrawer(false) }}
              >
                <div className="i-mdi-plus text-xl" />
                <span>新建对话</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type PcmStreamPlayer = {
  append: (buffer: ArrayBuffer) => void
  finish: () => void
  stop: () => void
}

function createPcmStreamPlayer(): PcmStreamPlayer | null {
  const context = getSharedRtcAudioContext()
  if (!context?.createBuffer || !context?.createBufferSource || !context?.destination) {
    console.warn('RTC TTS 实时播放不可用：当前环境不支持 createWebAudioContext')
    return null
  }

  let closed = false
  let nextStartAt = 0
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null
  let loggedFirstFrame = false
  let pendingBytes = new Uint8Array(0)
  const activeSources = new Set<any>()
  const sampleRate = 16000
  const targetChunkBytes = 5120

  const clearCleanupTimer = () => {
    if (cleanupTimer) clearTimeout(cleanupTimer)
    cleanupTimer = null
  }

  unlockRtcAudioPlayback('stream-player-create')

  const schedulePcm = (bytes: Uint8Array) => {
    const evenLength = bytes.byteLength - (bytes.byteLength % 2)
    if (closed || evenLength < 2) return
    const sampleCount = evenLength / 2
    const audioBuffer = context.createBuffer(1, sampleCount, sampleRate)
    const channel = audioBuffer.getChannelData(0)
    const view = new DataView(bytes.buffer, bytes.byteOffset, evenLength)
    for (let i = 0; i < sampleCount; i += 1) {
      channel[i] = Math.max(-1, Math.min(1, view.getInt16(i * 2, true) / 32768))
    }

    const source = context.createBufferSource()
    source.buffer = audioBuffer
    source.connect(context.destination)
    activeSources.add(source)
    source.onended = () => activeSources.delete(source)
    const currentTime = Number(context.currentTime || 0)
    if (nextStartAt < currentTime + 0.03) nextStartAt = currentTime + 0.04
    source.start(nextStartAt)
    if (!loggedFirstFrame) {
      loggedFirstFrame = true
      console.info('RTC TTS 实时播放已调度首帧', {
        currentTime,
        startAt: nextStartAt,
        startupDelayMs: Math.max(0, Math.round((nextStartAt - currentTime) * 1000)),
        chunkBytes: evenLength,
        contextState: context.state,
      })
    }
    nextStartAt += audioBuffer.duration || sampleCount / sampleRate
  }

  const flushPending = (force: boolean) => {
    while (pendingBytes.byteLength >= targetChunkBytes) {
      schedulePcm(pendingBytes.slice(0, targetChunkBytes))
      pendingBytes = pendingBytes.slice(targetChunkBytes)
    }
    if (force && pendingBytes.byteLength >= 2) {
      schedulePcm(pendingBytes.slice(0, pendingBytes.byteLength - (pendingBytes.byteLength % 2)))
      pendingBytes = new Uint8Array(0)
    }
  }

  return {
    append(buffer: ArrayBuffer) {
      if (closed || buffer.byteLength < 2) return
      try {
        unlockRtcAudioPlayback('stream-audio-frame')
        const incoming = new Uint8Array(buffer)
        const merged = new Uint8Array(pendingBytes.byteLength + incoming.byteLength)
        merged.set(pendingBytes)
        merged.set(incoming, pendingBytes.byteLength)
        pendingBytes = merged
        flushPending(false)
      } catch (err: any) {
        closed = true
        clearCleanupTimer()
        console.warn('RTC TTS 流式播放不可用，已降级为完整文件播放:', err?.message || err)
      }
    },
    finish() {
      if (closed) return
      try {
        flushPending(true)
      } catch (err: any) {
        console.warn('RTC TTS 尾帧播放失败:', err?.message || err)
      }
      const currentTime = Number(context.currentTime || 0)
      const delayMs = Math.max(300, Math.ceil((nextStartAt - currentTime + 0.3) * 1000))
      clearCleanupTimer()
      cleanupTimer = setTimeout(() => {
        closed = true
        cleanupTimer = null
      }, delayMs)
    },
    stop() {
      closed = true
      clearCleanupTimer()
      activeSources.forEach((source) => {
        try {
          source.stop?.()
        } catch {}
      })
      activeSources.clear()
      pendingBytes = new Uint8Array(0)
    },
  }
}

export default withRouteGuard(ChatPage)
