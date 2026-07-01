// @title AI健康顾问

import {Image, Textarea} from '@tarojs/components'
import Taro, {useDidHide, useDidShow } from '@tarojs/taro'
import {useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {supabase} from '@/client/supabase'
import {MarkdownRenderer} from '@/components/MarkdownRenderer'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {createChatMessage, createChatSession, getRtcHistoryGroups, updateChatSession } from '@/db/api'
import type {ChatMessage, ChatSession, RtcHistoryGroup } from '@/db/types'
import {getAiWebSocket} from '@/services/aiWebSocket'
import {useAppStore} from '@/store/appStore'
import {buildFamilyHealthContext} from '@/utils/allergenUtils'
import {buildChatPrompt} from '@/utils/aiPromptHelpers'
import {isPrivacyScopeError, isUserCancelError, showPrivacyScopeDeclarationTip} from '@/utils/wechatPrivacy'

function ChatPage() {
  const {user} = useAuth()
  const {activeMember, familyMembers, selectedMealMemberIds, isOnline, ingredients} = useAppStore()

  const routeParams = useMemo(() => Taro.getCurrentInstance().router?.params || {}, [])

  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [activeRtcGroupId, setActiveRtcGroupId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [inputHeight, setInputHeight] = useState(32)
  const [isLoading, setIsLoading] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [rtcHistoryGroups, setRtcHistoryGroups] = useState<RtcHistoryGroup[]>([])
  const [rtcHistoryLoading, setRtcHistoryLoading] = useState(false)
  const [rtcHistoryError, setRtcHistoryError] = useState('')
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [useProfile, setUseProfile] = useState(true)
  const [useIngredients, setUseIngredients] = useState(false)
  const recorderManager = useRef<Taro.RecorderManager | null>(null)
  const audioContextRef = useRef<Taro.InnerAudioContext | null>(null)
  const audioMessageIdRef = useRef<string | null>(null)
  const [pendingImage, setPendingImage] = useState<{localPath: string; base64: string; ext: string} | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  // WebSocket 语音通话状态
  const [voiceState, setVoiceState] = useState<'idle' | 'connecting' | 'active'>('idle')
  const [voiceMode, setVoiceMode] = useState(false)
  const voiceTempUserMsgId = useRef<string | null>(null)
  const voiceTempAiMsgId = useRef<string | null>(null)
  const voiceSessionRef = useRef<ChatSession | null>(null)

  const loadRtcHistory = useCallback(async () => {
    if (!user) return
    setRtcHistoryLoading(true)
    setRtcHistoryError('')
    try {
      const data = await getRtcHistoryGroups()
      setRtcHistoryGroups(data)
    } catch (err: any) {
      console.error('加载云端历史失败:', err?.message || err)
      setRtcHistoryError(err?.message || '云端历史加载失败')
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
      audioContextRef.current?.destroy()
      audioContextRef.current = null
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
    setInputHeight(32)
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

  const sendMessage = async (content: string, imageUrl?: string, imageBase64?: string, imageExt = 'jpg') => {
    if (!content.trim() && !imageUrl) return
    if (!isOnline) {
      Taro.showToast({title: '需要网络连接', icon: 'none'})
      return
    }

    let session = activeSession
    if (!session) {
      session = await createChatSession({
        user_id: user!.id,
        member_id: activeMember?.id || null,
        title: content.slice(0, 20) || '新对话',
        context_data: {}
      }) as ChatSession
      setActiveSession(session)
    }
    setActiveRtcGroupId(null)

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      session_id: session.id,
      role: 'user',
      content,
      image_url: imageUrl || null,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimisticMsg])
    setInputText('')
    setInputHeight(32)
    setIsLoading(true)

    createChatMessage({
      session_id: session.id,
      role: 'user',
      content,
      image_url: imageUrl || null
    }).then(saved => {
      if (saved) {
        setMessages(prev => prev.map(m => m.id === optimisticId ? saved : m))
      }
    })

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
        userQuestion: content,
        healthContext,
        ingredientContext
      })

      const ws = getAiWebSocket()
      let aiReply = ''
      const streamingAiId = `streaming-ai-${Date.now()}`
      const audioChunks: ArrayBuffer[] = []
      let streamingAudioUrl: string | null = null
      let audioWritePromise: Promise<string | null> | null = null
      let ttsEnded = false
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
        setMessages(prev => prev.map(m => m.id === streamingAiId ? {...m, content: text} : m))
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
        if (imageBase64) {
          await ws.connect({mode: 'default', userId: user!.id})
          createStreamingAiMessage()
          aiReply = await ws.requestImageResponse({
            triggerText: '请先请求上传图片。收到图片后，结合图片和用户问题给出简洁回答。',
            imageBase64,
            fileName: `chat-image.${imageExt}`,
            finalText: `图片已上传完成，请直接结合图片和问题回答，不要再次请求上传图片。\n${fullPrompt}`,
            onInterim: updateStreamingAiMessage
          })
        } else {
          await ws.connect({mode: 'default', userId: user!.id})
          createStreamingAiMessage()
          aiReply = await ws.requestResponse(fullPrompt, {
            onInterim: updateStreamingAiMessage,
            onAudio: (buffer) => audioChunks.push(buffer),
            onTtsEnd: () => {
              ttsEnded = true
              void attachAudioToStreamingMessage()
            }
          })
          if (!streamingAudioUrl && (ttsEnded || audioChunks.length > 0)) {
            streamingAudioUrl = await attachAudioToStreamingMessage()
          }
        }
      } finally {
        ws.disconnect()
      }

      const aiMsg = await createChatMessage({
        session_id: session.id,
        role: 'assistant',
        content: aiReply || '抱歉，我暂时无法回答您的问题，请稍后重试。'
      })
      if (aiMsg) {
        const renderedAiMsg = streamingAudioUrl ? {...aiMsg, audio_url: streamingAudioUrl} : aiMsg
        setMessages(prev => {
          const hasStreamingMessage = prev.some(m => m.id === streamingAiId)
          if (!hasStreamingMessage) return [...prev, renderedAiMsg]
          return prev.map(m => m.id === streamingAiId ? renderedAiMsg : m)
        })
      }

      if (messages.length === 0) {
        await updateChatSession(session.id, {title: content.slice(0, 20)})
      }
    } catch (err: any) {
      console.error('AI回复失败详情:', err?.message || err, err)
      Taro.showToast({title: 'AI回复失败，请重试', icon: 'none'})
    } finally {
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

  const readImageAsBase64 = (filePath: string): Promise<{base64: string; ext: string}> => {
    return new Promise((resolve, reject) => {
      const fs = Taro.getFileSystemManager()
      fs.readFile({
        filePath,
        encoding: 'base64',
        success: (res) => {
          const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg'
          const mimeMap: Record<string, string> = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp'}
          const mime = mimeMap[ext] || 'image/jpeg'
          resolve({base64: `data:${mime};base64,${res.data}`, ext})
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
    const isMp3 = (
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    )
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

  const handlePlayAudio = useCallback((msg: ChatMessage) => {
    if (!msg.audio_url) return
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
      console.warn('播放 RTC TTS 音频失败:', err?.errMsg || err)
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

  // ── WebSocket 语音通话逻辑 ──────────────────────────────────────────────

  const ensureSession = useCallback(async (title: string): Promise<ChatSession | null> => {
    if (voiceSessionRef.current) return voiceSessionRef.current
    if (activeSession) { voiceSessionRef.current = activeSession; return activeSession }
    const s = await createChatSession({
      user_id: user!.id,
      member_id: activeMember?.id || null,
      title,
      context_data: {}
    }) as ChatSession
    setActiveSession(s)
    setActiveRtcGroupId(null)
    voiceSessionRef.current = s
    return s
  }, [activeSession, activeMember, user])

  const handleStartVoiceCall = useCallback(async () => {
    if (!isOnline) { Taro.showToast({title: '需要网络连接', icon: 'none'}); return }
    if (voiceState !== 'idle') return

    setVoiceState('connecting')
    Taro.showToast({title: '正在连接…', icon: 'loading', duration: 3000})

    try {
      const ws = getAiWebSocket()
      await ws.connect({mode: 'default', userId: user!.id})
      Taro.hideToast()
      setVoiceState('active')
      Taro.showToast({title: '语音通话已开始', icon: 'success', duration: 1500})

      ws.onMessage('asr-interim', async (data) => {
        const text = data as string
        const session = await ensureSession('语音对话')
        if (!session) return
        if (voiceTempUserMsgId.current) {
          setMessages(prev => prev.map(m =>
            m.id === voiceTempUserMsgId.current ? {...m, content: `🎙 ${text}`} : m
          ))
        } else {
          const placeholder: ChatMessage = {
            id: `voice-user-${Date.now()}`, session_id: session.id,
            role: 'user', content: `🎙 ${text}`, image_url: null, created_at: new Date().toISOString()
          }
          voiceTempUserMsgId.current = placeholder.id
          setMessages(prev => [...prev, placeholder])
        }
      })

      ws.onMessage('asr-final', async (data) => {
        const text = data as string
        const session = await ensureSession('语音对话')
        if (!session) return
        const saved = await createChatMessage({session_id: session.id, role: 'user', content: text, image_url: null})
        if (saved) {
          if (voiceTempUserMsgId.current) {
            setMessages(prev => prev.map(m => m.id === voiceTempUserMsgId.current ? saved : m))
          } else {
            setMessages(prev => [...prev, saved])
          }
          voiceTempUserMsgId.current = null
        }
      })

      ws.onMessage('llm-interim', async (data) => {
        const text = data as string
        const session = await ensureSession('语音对话')
        if (!session) return
        if (voiceTempAiMsgId.current) {
          setMessages(prev => prev.map(m => m.id === voiceTempAiMsgId.current ? {...m, content: text} : m))
        } else {
          const placeholder: ChatMessage = {
            id: `voice-ai-${Date.now()}`, session_id: session.id,
            role: 'assistant', content: text, image_url: null, created_at: new Date().toISOString()
          }
          voiceTempAiMsgId.current = placeholder.id
          setMessages(prev => [...prev, placeholder])
        }
      })

      ws.onMessage('llm-final', async (data) => {
        const text = data as string
        const session = await ensureSession('语音对话')
        if (!session) return
        const saved = await createChatMessage({session_id: session.id, role: 'assistant', content: text, image_url: null})
        if (saved) {
          if (voiceTempAiMsgId.current) {
            setMessages(prev => prev.map(m => m.id === voiceTempAiMsgId.current ? saved : m))
          } else {
            setMessages(prev => [...prev, saved])
          }
          voiceTempAiMsgId.current = null
        }
      })

      const rm = Taro.getRecorderManager()
      rm.onFrameRecorded?.((res: any) => {
        if (res.frameBuffer) ws.sendAudio(res.frameBuffer)
      })
      rm.start({duration: 600000, format: 'PCM' as any, sampleRate: 16000, numberOfChannels: 1, frameSize: 640})
      recorderManager.current = rm
    } catch {
      setVoiceState('idle')
      Taro.hideToast()
      Taro.showToast({title: '语音连接失败，请重试', icon: 'none'})
    }
  }, [ensureSession, isOnline, voiceState])

  const handleStopVoiceCall = useCallback(() => {
    recorderManager.current?.stop()
    const ws = getAiWebSocket()
    ws.disconnect()
    setVoiceState('idle')
    voiceTempUserMsgId.current = null
    voiceTempAiMsgId.current = null
    voiceSessionRef.current = null
    Taro.showToast({title: '通话已结束', icon: 'none'})
  }, [])

  const handleVoiceMicToggle = useCallback(() => {
    if (isRecording) {
      recorderManager.current?.stop()
      return
    }

    const doStartRecord = () => {
      const rm = Taro.getRecorderManager()
      recorderManager.current = rm
      rm.onStart(() => setIsRecording(true))
      rm.onStop(async (res) => {
        setIsRecording(false)
        if (!res.tempFilePath) return
        try {
          const {base64} = await readAudioAsBase64(res.tempFilePath)
          const buffer = Taro.base64ToArrayBuffer(base64)
          const ws = getAiWebSocket()
          await ws.connect({mode: 'default', userId: user!.id})
          ws.sendAudio(buffer)
          const text = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => { unsub(); reject(new Error('timeout')) }, 15000)
            const unsub = ws.onMessage('asr-final', (data) => {
              clearTimeout(timeout)
              unsub()
              resolve(data as string)
            })
          })
          ws.disconnect()
          if (text.trim()) {
            sendMessage(`🎙 ${text.trim()}`)
          } else {
            Taro.showToast({title: '语音识别失败，请重试', icon: 'none'})
          }
        } catch {
          Taro.showToast({title: '语音识别失败，请重试', icon: 'none'})
        }
      })
      rm.start({duration: 10000, format: 'PCM' as any, sampleRate: 16000, numberOfChannels: 1, frameSize: 640})
    }

    const showSettingGuide = () => {
      Taro.showModal({
        title: '需要麦克风权限',
        content: '请前往设置页开启麦克风权限后再使用语音输入',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => { if (res.confirm) Taro.openSetting() }
      })
    }

    Taro.getSetting({
      success: (settingRes: any) => {
        const status = settingRes?.authSetting?.['scope.record']
        if (status === true) {
          doStartRecord()
        } else if (status === false) {
          showSettingGuide()
        } else {
          Taro.authorize({
            scope: 'scope.record',
            success: () => doStartRecord(),
            fail: () => showSettingGuide()
          })
        }
      },
      fail: () => {
        Taro.authorize({
          scope: 'scope.record',
          success: () => doStartRecord(),
          fail: () => showSettingGuide()
        })
      }
    })
  }, [isRecording, sendMessage])

  const handleImageUpload = async () => {
    try {
      const res = await Taro.chooseMedia({count: 1, mediaType: ['image']})
      if (!res.tempFiles?.[0]) return
      const localPath = res.tempFiles[0].tempFilePath
      const image = await readImageAsBase64(localPath)
      setPendingImage({localPath, base64: image.base64, ext: image.ext})
    } catch (err) {
      if (isUserCancelError(err)) return
      if (isPrivacyScopeError(err)) {
        console.warn('图片选择隐私配置缺失:', err)
        showPrivacyScopeDeclarationTip('相册/摄像头')
        return
      }
      Taro.showToast({title: '选取图片失败', icon: 'none'})
    }
  }

  const handleSendWithImage = async () => {
    if (isUploadingImage || isLoading) return
    if (!pendingImage) {
      if (inputText.trim()) sendMessage(inputText)
      return
    }
    setIsUploadingImage(true)
    let loadingShown = false
    Taro.showLoading({title: '上传中...'})
    loadingShown = true
    try {
      const {uploadToSupabase} = await import('@/utils/upload')
      const result = await uploadToSupabase(
        {tempFilePath: pendingImage.localPath} as any,
        {bucket: 'chat-images', userId: user!.id}
      )
      Taro.hideLoading()
      loadingShown = false
      if (result.success && result.data) {
        const {data: urlData} = supabase.storage.from('chat-images').getPublicUrl(result.data.path)
        setPendingImage(null)
        sendMessage(inputText || '请分析这张图片中的食物', urlData.publicUrl, pendingImage.base64, pendingImage.ext)
      } else {
        Taro.showToast({title: '图片上传失败', icon: 'none'})
      }
    } catch {
      if (loadingShown) Taro.hideLoading()
      Taro.showToast({title: '图片上传失败', icon: 'none'})
    } finally {
      setIsUploadingImage(false)
    }
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

  const inputBarHeight = pendingImage ? 98 : 54
  const messageBottomPadding = inputBarHeight + 10

  return (
    <div className="w-full h-screen flex flex-col bg-background overflow-x-hidden">
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
                  onClick={() => sendMessage(q)}
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
                        {msg.content.startsWith('🎙 ') ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-end gap-0.5 flex-shrink-0" style={{height: '18px'}}>
                              {[0,1,2,3].map(i => (
                                <div key={i} className="rounded-full bg-white/80 animate-soundwave"
                                  style={{width: '3px', height: `${6 + (i % 3) * 4}px`, animationDelay: `${i * 0.12}s`}} />
                              ))}
                            </div>
                            <p className="text-xl leading-relaxed">{msg.content.slice(3)}</p>
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
        className="flex-shrink-0 bg-card border-t border-border fixed left-0 right-0"
        style={{
          padding: '6px 12px',
          bottom: '0',
          zIndex: 50,
          transform: 'translateZ(0)'
        }}
      >
        {isRecording && (
          <div
            className="absolute left-0 right-0 flex flex-col items-center justify-center gap-3 bg-card rounded-t-2xl"
            style={{bottom: '100%', padding: '20px 0 16px', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)', zIndex: 10}}
          >
            <div className="relative flex items-center justify-center">
              <div className="absolute rounded-full bg-destructive/10 animate-pulse" style={{width: '72px', height: '72px'}} />
              <div className="relative flex items-center justify-center rounded-full bg-destructive" style={{width: '56px', height: '56px'}}>
                <div className="i-mdi-microphone text-3xl text-white" />
              </div>
            </div>
            <div className="flex items-end gap-1" style={{height: '28px'}}>
              {[0,1,2,3,4,5,6].map(i => (
                <div
                  key={i}
                  className="rounded-full bg-destructive animate-soundwave"
                  style={{width: '4px', height: `${10 + (i % 4) * 5}px`, animationDelay: `${i * 0.1}s`}}
                />
              ))}
            </div>
            <p className="text-xl text-muted-foreground">松开发送 · 上滑取消</p>
          </div>
        )}

        {voiceState === 'active' ? (
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex items-center gap-2 flex-1">
              <div className="i-mdi-robot text-2xl text-primary flex-shrink-0" />
              <span className="text-xl text-foreground">AI 正在倾听...</span>
              <div className="flex items-end gap-0.5" style={{height: '20px'}}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="rounded-full bg-primary animate-soundwave"
                    style={{width: '3px', height: `${8 + (i % 3) * 5}px`, animationDelay: `${i * 0.12}s`}} />
                ))}
              </div>
            </div>
            <button type="button" className="flex-shrink-0 flex items-center justify-center leading-none rounded-full"
              style={{width: '44px', height: '44px', backgroundColor: '#EF4444'}} onClick={handleStopVoiceCall}>
              <div className="i-mdi-phone-hangup text-2xl text-white" />
            </button>
          </div>
        ) : voiceMode ? (
          <div className="flex items-center gap-3">
            <button type="button" className="flex-shrink-0 flex items-center justify-center"
              style={{width: '44px', height: '44px'}} onClick={() => setVoiceMode(false)}>
              <div className="i-mdi-keyboard text-2xl text-muted-foreground" />
            </button>
            <div
              className="flex-1 flex items-center justify-center rounded-full border-2 transition-colors"
              style={{
                height: '44px',
                borderColor: isRecording ? '#EF4444' : 'hsl(var(--border))',
                backgroundColor: isRecording ? '#FEF2F2' : 'hsl(var(--background))',
              }}
              onTouchStart={() => { if (!isRecording) handleVoiceMicToggle() }}
              onTouchEnd={() => { if (isRecording) recorderManager.current?.stop() }}
            >
              <div className="flex items-center gap-2">
                <div className={`i-mdi-microphone text-xl ${isRecording ? 'text-destructive' : 'text-muted-foreground'}`} />
                <span className={`text-xl ${isRecording ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {isRecording ? '录音中...' : '按住说话'}
                </span>
              </div>
            </div>
            <button type="button" className="flex-shrink-0 flex items-center justify-center leading-none rounded-full"
              style={{width: '44px', height: '44px', backgroundColor: voiceState === 'connecting' ? '#F97316' : '#4A7C59'}}
              onClick={voiceState === 'idle' ? handleStartVoiceCall : undefined}>
              {voiceState === 'connecting'
                ? <div className="i-mdi-loading text-xl text-white" style={{animation: 'spin 1s linear infinite'}} />
                : <div className="i-mdi-robot text-xl text-white" />}
            </button>
          </div>
        ) : (
          <div className="flex flex-col" style={{gap: '6px'}}>
            {pendingImage && (
              <div className="flex items-center gap-2 px-1">
                <div className="relative flex-shrink-0" style={{width: '56px', height: '56px'}}>
                  <Image
                    src={pendingImage.localPath}
                    mode="aspectFill"
                    style={{width: '56px', height: '56px', borderRadius: '8px', display: 'block'}}
                  />
                  {isUploadingImage && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg"
                      style={{backgroundColor: 'rgba(0,0,0,0.4)'}}>
                      <div className="i-mdi-loading text-xl text-white" style={{animation: 'spin 1s linear infinite'}} />
                    </div>
                  )}
                  <div
                    className="absolute flex items-center justify-center rounded-full bg-foreground"
                    style={{width: '18px', height: '18px', top: '-6px', right: '-6px'}}
                    onClick={() => setPendingImage(null)}
                  >
                    <div className="i-mdi-close text-white" style={{fontSize: '12px'}} />
                  </div>
                </div>
                <span className="text-xl text-muted-foreground">已选图片，点发送上传</span>
              </div>
            )}
            <div className="flex items-end" style={{gap: '8px'}}>
              <button type="button" className="flex-shrink-0 flex items-center justify-center"
                style={{width: '40px', height: '40px'}} onClick={() => setVoiceMode(true)}>
                <div className="i-mdi-microphone text-2xl text-muted-foreground" />
              </button>
              <div className="flex items-center bg-white"
                style={{flex: 1, minWidth: 0, borderRadius: '18px', border: '1px solid #E5E5E5', minHeight: '38px', padding: '0 10px', gap: '8px'}}>
                <Textarea
                  className="flex-1 text-xl bg-transparent outline-none leading-normal"
                  placeholder="输入健康问题..."
                  value={inputText}
                  adjustPosition
                  showConfirmBar={false}
                  cursorSpacing={0}
                  style={{minWidth: 0, height: `${inputHeight}px`, maxHeight: '88px', resize: 'none', color: '#333333', lineHeight: '20px', display: 'block', overflowY: 'hidden', padding: '5px 0', boxSizing: 'border-box'}}
                  onInput={(e) => {
                    const ev = e as any
                    const nextValue = ev.detail?.value ?? ev.target?.value ?? ''
                    setInputText(nextValue)
                    const lineCount = Math.min(Math.max(nextValue.split('\n').length, 1), 4)
                    setInputHeight(Math.min(88, Math.max(32, 10 + lineCount * 20)))
                  }}
                />
                <div className="flex-shrink-0 flex items-center justify-center" style={{width: '28px', height: '28px'}}
                  onClick={handleImageUpload}>
                  <div className={`i-mdi-image-outline text-2xl ${pendingImage ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              </div>
              <button
                type="button"
                className="flex-shrink-0 flex items-center justify-center leading-none rounded-full transition-colors duration-200"
                style={{width: '40px', height: '40px', backgroundColor: (inputText.trim() || pendingImage) && !isLoading && !isUploadingImage ? '#4A7C59' : '#E5E5E5'}}
                onClick={handleSendWithImage}
              >
                <div className="i-mdi-arrow-up text-2xl"
                  style={{color: (inputText.trim() || pendingImage) && !isLoading && !isUploadingImage ? '#ffffff' : '#999999'}} />
              </button>
            </div>
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
              <span className="text-2xl font-semibold text-foreground">对话历史</span>
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
                  <p className="text-xl text-muted-foreground">正在加载云端历史...</p>
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
              ) : rtcHistoryGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="i-mdi-chat-outline text-5xl text-muted-foreground" />
                  <p className="text-xl text-muted-foreground">暂无云端对话历史</p>
                </div>
              ) : rtcHistoryGroups.map(group => (
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
                        {new Date(group.endTime * 1000).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="i-mdi-chevron-right text-2xl text-muted-foreground flex-shrink-0" />
                  </div>
              ))}
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

export default withRouteGuard(ChatPage)
