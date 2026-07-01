import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const wsSource = readFileSync(resolve(root, 'src/services/aiWebSocket.ts'), 'utf8')
const chatSource = readFileSync(resolve(root, 'src/pages/chat/index.tsx'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/pages/home/index.tsx'), 'utf8')
const recipeSource = readFileSync(resolve(root, 'src/pages/recipe/index.tsx'), 'utf8')
const markdownSource = readFileSync(resolve(root, 'src/components/MarkdownRenderer.tsx'), 'utf8')
const configSource = readFileSync(resolve(root, 'config/index.ts'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/db/api.ts'), 'utf8')
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
  chatSource.includes("await ws.connect({mode: 'default', userId: user!.id})") &&
    !chatSource.includes('CHAT_TTS_CFG') &&
    !chatSource.includes('VOICE_CFG'),
  'chat page should connect through RTC default agent mode for text, image, and voice flows'
)

assert(
  homeSource.includes("await ws.connect({mode: 'default'})") &&
    !homeSource.includes('CHAT_CFG') &&
    !homeSource.includes('VOICE_CFG') &&
    recipeSource.includes("await ws.connect({mode: 'default'})") &&
    !recipeSource.includes('CHAT_CFG'),
  'home and recipe AI flows should also use RTC default agent mode'
)

assert(
  chatSource.includes('onAudio: (buffer) => audioChunks.push(buffer)') &&
    chatSource.includes('onTtsEnd: () =>') &&
    chatSource.includes('writeAudioChunksToTempFile'),
  'normal chat should collect RTC TTS audio chunks and write them to a temporary file'
)

assert(
  wsSource.includes('audioIdleMs = 1200') &&
    wsSource.includes('ttsNoAudioGraceMs = 15000') &&
    wsSource.includes('RTC TTS audio idle') &&
    wsSource.includes('audio chunk received'),
  'requestResponse should wait for RTC TTS audio after final text and log binary audio chunks'
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
  chatSource.includes('requestImageResponse({') &&
    chatSource.includes('onInterim: updateStreamingAiMessage'),
  'image chat should stream interim text into the assistant bubble'
)

assert(
  chatSource.includes('getRtcHistoryGroups') &&
    chatSource.includes('rtcHistoryGroups.map') &&
    chatSource.includes('handleSelectRtcHistory'),
  'chat history drawer should render grouped RTC cloud history'
)

assert(
  !chatSource.includes('getChatSessions') &&
    !chatSource.includes('getChatMessages') &&
    !chatSource.includes('deleteChatSession') &&
    !chatSource.includes('deleteMultipleChatSessions'),
  'chat history drawer should no longer read or mutate local chat session history'
)

assert(
  homeSource.includes('onInterim: (text) =>') &&
    homeSource.includes('setAnalysisResult('),
  'home nutrition analysis should render interim AI output'
)

assert(
  recipeSource.includes('onInterim: (text) =>') &&
    recipeSource.includes('setRecipeContent(text)'),
  'recipe generation should render interim AI output'
)

assert(
  wsSource.includes('type AiWebSocketMetrics') &&
    wsSource.includes("console.info('[AiWebSocket][metrics]'") &&
    wsSource.includes('sendToFirstInterimMs') &&
    wsSource.includes('sendToFinalMs'),
  'aiWebSocket should log structured latency metrics for connect and response phases'
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
  !markdownSource.includes('text-xl text-foreground leading-relaxed') &&
    !markdownSource.includes("fontSize: '18px'") &&
    markdownSource.includes('markdown-compact'),
  'MarkdownRenderer should use compact typography and expose a markdown-compact root class'
)

console.log('chat streaming checks passed')
