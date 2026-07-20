import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const wsSource = readFileSync(resolve(root, 'src/services/aiWebSocket.ts'), 'utf8')
const chatSource = readFileSync(resolve(root, 'src/pages/chat/index.tsx'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/pages/home/index.tsx'), 'utf8')
const recipeSource = readFileSync(resolve(root, 'src/pages/recipe/index.tsx'), 'utf8')
const markdownSource = readFileSync(resolve(root, 'src/components/MarkdownRenderer.tsx'), 'utf8')
const markdownTextSource = readFileSync(resolve(root, 'src/utils/markdownText.ts'), 'utf8')
const appStyleSource = readFileSync(resolve(root, 'src/app.scss'), 'utf8')
const configSource = readFileSync(resolve(root, 'config/index.ts'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/db/api.ts'), 'utf8')
const wsSignSource = readFileSync(resolve(root, 'supabase/functions/ws-sign/index.ts'), 'utf8')
const brtcConfigPath = resolve(root, 'src/utils/brtcConfig.ts')
const brtcConfigSource = existsSync(brtcConfigPath) ? readFileSync(brtcConfigPath, 'utf8') : ''

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(
  wsSource.includes('onInterim?: (text: string) => void'),
  'requestResponse options should expose an onInterim callback'
)

assert(
  wsSource.includes('opts?.onInterim?.(interimText.trim())'),
  'requestResponse should publish merged interim LLM text'
)

assert(
  wsSource.includes('onInterim?: (text: string) => void') &&
    wsSource.includes('options.onInterim?.(interimText.trim())'),
  'requestImageResponse should publish merged interim LLM text for image chat'
)

assert(
  chatSource.includes('streamingAiId'),
  'chat page should create a temporary assistant message for streaming output'
)

assert(
  chatSource.includes('onInterim: updateStreamingAiMessage'),
  'normal chat request should pass onInterim to requestResponse'
)

assert(
  !configSource.includes('TARO_APP_QIANFAN_TOKEN') &&
    !brtcConfigSource.includes('qianfan') &&
    !brtcConfigSource.includes('llm_url') &&
    !brtcConfigSource.includes('llm_token') &&
    !brtcConfigSource.includes('llm_cfg'),
  'RTC default agent mode should not keep Qianfan or third-party LLM config in the miniapp build'
)

assert(
  chatSource.includes("await ws.connect({mode: 'default', agentProfile: 'chat', userId: user!.id})") &&
    chatSource.includes("await ws.connect({mode: 'default', agentProfile: 'voice-ptt', userId: user!.id})") &&
    !chatSource.includes("agentProfile: 'vision'") &&
    !chatSource.includes("agentProfile: 'voice-realtime'") &&
    !chatSource.includes('CHAT_TTS_CFG') &&
    !chatSource.includes('VOICE_CFG'),
  'chat page should use only RTC text and push-to-talk profiles for this demo'
)

assert(
  homeSource.includes("await ws.connect({mode: 'default', agentProfile, userId: user?.id})") &&
    !homeSource.includes('CHAT_CFG') &&
    !homeSource.includes('VOICE_CFG') &&
    recipeSource.includes("await ws.connect({mode: 'default', agentProfile: 'chat'})") &&
    !recipeSource.includes('CHAT_CFG'),
  'home and recipe AI flows should also use RTC default agent mode'
)

assert(
  wsSignSource.includes('/api/v1/aiagent/generateAIAgentCall') &&
    wsSignSource.includes('/auth/v1/user') &&
    wsSignSource.includes('getCurrentUserId') &&
    wsSignSource.includes("const {agentProfile = 'chat'}") &&
    wsSignSource.includes('const userId = await getCurrentUserId') &&
    wsSignSource.includes('buildDefaultAgentConfig') &&
    wsSignSource.includes("audiocodec: 'raw16k'") &&
    wsSignSource.includes('ai_agent_instance_id') &&
    wsSignSource.includes('context?.token') &&
    wsSignSource.includes('userId,') &&
    !wsSignSource.includes("const {agentProfile = 'chat', userId}") &&
    !wsSignSource.includes('&ak=${AK}&sk=${SK}'),
  'ws-sign should resolve the RTC userId from Supabase Auth, create a Baidu RTC default agent instance server-side, and return an RTC id/token URL'
)

assert(
  wsSource.includes('userId?: string') &&
    wsSource.includes('this.userId = data.userId || options.userId ||') &&
    !wsSource.includes('userId: options.userId ||'),
  'aiWebSocket should use the server-resolved ws-sign userId for RTC device info'
)

assert(
  chatSource.includes("await ws.sendControl('[E]:[CMD]:[ASR_START_LONGTEXT_REC]')") &&
    chatSource.includes("await ws.sendControl('[E]:[CMD]:[ASR_STOP_LONGTEXT_REC]')") &&
    chatSource.includes('createAiWebSocket()') &&
    wsSource.includes('export function createAiWebSocket()') &&
    homeSource.includes("await ws.sendControl('[E]:[CMD]:[ASR_START_LONGTEXT_REC]')") &&
    homeSource.includes("await ws.sendControl('[E]:[CMD]:[ASR_STOP_LONGTEXT_REC]')"),
  'push-to-talk flows should use RTC ASR control commands without reusing the chat reply socket'
)

assert(
  chatSource.includes('VOICE_MESSAGE_PREFIX') &&
    chatSource.includes('getVoiceTranscript') &&
    chatSource.includes('语音消息') &&
    chatSource.includes('i-mdi-microphone'),
  'chat page should render WeChat-style voice message bubbles'
)

assert(
  chatSource.includes('VOICE_LONG_PRESS_MS') &&
    chatSource.includes('VOICE_LONG_PRESS_MS = 120') &&
    chatSource.includes('MIN_VOICE_RECORD_MS = 500') &&
    chatSource.includes('voicePressTimerRef') &&
    chatSource.includes('voicePressingRef') &&
    chatSource.includes('setIsVoicePressing(true)') &&
    chatSource.includes('startVoiceRecording') &&
    chatSource.includes('interruptActiveChatResponse') &&
    chatSource.includes('AI 回复已被用户语音输入打断') &&
    !chatSource.includes('if (isLoading || isUploadingImage) return') &&
    !chatSource.includes('handleVoiceMicToggle'),
  'push-to-talk should start after a short hold and interrupt active AI/TTS output instead of being blocked by isLoading'
)

assert(
    chatSource.includes('setIsLoading(true)\n    let requestWs: ReturnType<typeof getAiWebSocket> | null = null') &&
    chatSource.includes('requestWs = ws') &&
    chatSource.includes('interruptedChatWsRef.current.has(requestWs)') &&
    !chatSource.includes(`setRtcHistoryError('')
    let requestWs`),
  'sendMessage should keep requestWs in scope so interrupted chat requests do not throw ReferenceError'
)

assert(
  chatSource.includes("createLocalChatMessage(session.id, 'user', `${VOICE_MESSAGE_PREFIX}正在识别...`)") &&
    chatSource.includes('writePcmVoiceToWavFile') &&
    chatSource.includes('voice-message-${Date.now()}.wav') &&
    chatSource.includes('onClick={() => handlePlayAudio(msg)}') &&
    chatSource.includes("msg.audio_url ? (playingAudioId === msg.id ? '正在播放' : '点击播放') : '正在处理'") &&
    !chatSource.includes("{getVoiceTranscript(msg.content) || '正在识别...'}"),
  'user voice bubbles should wrap recorded PCM as playable WAV without showing the ASR transcript'
)

assert(
  chatSource.includes('audioChunks.push(buffer)') &&
    chatSource.includes('liveAudioPlayer?.append(buffer)') &&
    chatSource.includes('onTtsEnd: () =>') &&
    chatSource.includes('writeAudioChunksToTempFile'),
  'normal chat should collect RTC TTS audio chunks, stream playable PCM, and write them to a temporary file'
)

assert(
  wsSource.includes('audioIdleMs = 1200') &&
    wsSource.includes('ttsNoAudioGraceMs = 15000') &&
    wsSource.includes('ttsNotStartedGraceMs = 6000') &&
    wsSource.includes('waiting for trailing audio') &&
    wsSource.includes('RTC TTS audio idle') &&
    wsSource.includes('audio chunk received'),
  'requestResponse should keep the audio listener through TTS end and wait for trailing frames'
)

assert(
  chatSource.includes('ttsEnded || audioChunks.length > 0'),
  'chat page should persist RTC audio chunks even when the gateway omits TTS_END'
)

assert(
  !chatSource.includes("'tts-minimax'") &&
    !chatSource.includes('备用 TTS') &&
    !chatSource.includes('synthesizeFallbackAudio'),
  'normal chat should not call the removed MiniMax/Baidu fallback TTS function'
)

assert(
  chatSource.includes('handlePlayAudio') &&
    chatSource.includes('i-mdi-volume-high') &&
    chatSource.includes('朗读'),
  'assistant messages with RTC TTS audio should expose a read-aloud playback button'
)

assert(
  chatSource.includes('createPcmStreamPlayer') &&
    chatSource.includes('createWebAudioContext') &&
    chatSource.includes('getSharedRtcAudioContext') &&
    chatSource.includes("unlockRtcAudioPlayback('voice-touch')") &&
    chatSource.includes("unlockRtcAudioPlayback('send-button-touch')") &&
    chatSource.includes("unlockRtcAudioPlayback('suggestion-touch')") &&
    chatSource.includes('rtcAudioKeepaliveSource') &&
    chatSource.includes('keepaliveSeconds = 45') &&
    chatSource.includes('targetChunkBytes = 5120') &&
    chatSource.includes('flushPending(true)') &&
    chatSource.includes('RTC TTS 实时播放已调度首帧') &&
    chatSource.includes('view.getInt16(i * 2, true)') &&
    !chatSource.includes('context.close?.()'),
  'normal chat should reuse an unlocked WebAudio context for low-latency PCM playback'
)

assert(
  appStyleSource.includes('@keyframes voiceRipple') &&
    chatSource.includes('voiceRipple') &&
    chatSource.includes("backgroundColor: isVoiceButtonActive ? (isRecordingCanceling ? '#FFF7ED' : '#EF4444')"),
  'recording UI should turn red immediately and show a ripple effect while the user is holding the button'
)

assert(
  chatSource.includes('const isMp3 = bytes[0] === 0x49') &&
    !chatSource.includes('(bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)'),
  'RTC raw PCM chunks should not be misclassified as MP3 by a loose frame-sync check'
)

assert(
  chatSource.includes('prev.map(m => m.id === streamingAiId'),
  'chat page should update the temporary assistant bubble as chunks arrive'
)

assert(
  chatSource.includes("const hasStreamingAiMessage = messages.some(msg => msg.id.startsWith('streaming-ai-'))") &&
    chatSource.includes('isLoading && !hasStreamingAiMessage'),
  'chat page should hide the loading placeholder while the streaming assistant bubble exists'
)

assert(
  !chatSource.includes('target.style.height'),
  'chat textarea should not mutate DOM target.style in the WeChat mini program runtime'
)

assert(
  !chatSource.includes('requestImageResponse({') &&
    !chatSource.includes('chooseMedia') &&
    !chatSource.includes('pendingImage') &&
    !chatSource.includes('handleImageUpload'),
  'chat multimodal upload and image analysis should be absent from this demo'
)

assert(
  chatSource.includes('getRtcHistoryGroups') &&
    chatSource.includes('rtcHistoryGroups.map') &&
    chatSource.includes('handleSelectRtcHistory') &&
    chatSource.includes('最近 10 个历史对话') &&
    chatSource.includes('RTC 云端记录，按 30 分钟自动分段'),
  'chat history drawer should render the latest 10 grouped RTC cloud history conversations'
)

assert(
  !chatSource.includes('getChatSessions') &&
    !chatSource.includes('getChatMessages') &&
    !chatSource.includes('createChatSession') &&
    !chatSource.includes('createChatMessage') &&
    !chatSource.includes('updateChatSession') &&
    !chatSource.includes('handleSelectChatSession') &&
    !chatSource.includes('应用会话历史'),
  'chat page should not maintain locally persisted app chat sessions for history'
)

assert(
  !chatSource.includes('deleteChatSession') &&
    !chatSource.includes('deleteMultipleChatSessions'),
  'chat history drawer should not delete local chat session history'
)

assert(
  homeSource.includes('onInterim: (text) =>') &&
    homeSource.includes('setAnalysisResult('),
  'home nutrition analysis should render interim AI output'
)

assert(
  recipeSource.includes('onInterim: (text) =>') &&
    recipeSource.includes('setRecipeContent(normalizeAiMarkdown(text))'),
  'recipe generation should render normalized interim AI output'
)

assert(
  wsSource.includes('type AiWebSocketMetrics') &&
    wsSource.includes("console.info('[AiWebSocket][metrics]'") &&
    wsSource.includes('sendToFirstInterimMs') &&
    wsSource.includes('sendToFinalMs') &&
    wsSource.includes('sendToTtsStartMs') &&
    wsSource.includes('sendToFirstAudioMs') &&
    wsSource.includes('audioChunkCount'),
  'aiWebSocket should log structured latency metrics for connect, text, and RTC TTS phases'
)

assert(
  wsSource.includes('wsSignMs') &&
    wsSource.includes('socketOpenMs') &&
    wsSource.includes('mediaReadyMs') &&
    wsSource.includes('connectReadyMs'),
  'aiWebSocket metrics should include ws-sign, socket open, media ready, and connect ready timings'
)

assert(
  wsSource.includes('licenseWaitTimer') &&
    wsSource.includes('this.resolveReady()') &&
    wsSource.includes('}, 800)'),
  'aiWebSocket should briefly wait for license negotiation after MEDIA READY before resolving connect'
)

assert(
  apiSource.includes('status === 404') &&
    apiSource.includes('return []'),
  'RTC history should degrade to an empty list when the brtc-history edge function is not deployed'
)

assert(
  markdownSource.includes('markdown-compact') &&
    markdownSource.includes('text-xl text-foreground leading-snug') &&
    markdownSource.includes("fontSize: '16px'"),
  'MarkdownRenderer should keep assistant markdown readable at the same text scale as chat input'
)

assert(
  markdownTextSource.includes('normalizeMarkdownStructure') &&
    markdownTextSource.includes("replace(/^(\\s*)>\\s?/, '$1')") &&
    markdownTextSource.includes("trimmed === '：' || trimmed === ':'") &&
    markdownTextSource.includes('isMarkdownListLine') &&
    markdownSource.includes("/^ {1,4}\\S/") &&
    markdownSource.includes('pushPlainText'),
  'AI markdown normalization should strip blockquote markers, drop orphan colons, indent colon-prefixed continuations, and hide stray markdown markers'
)

console.log('chat streaming checks passed')
