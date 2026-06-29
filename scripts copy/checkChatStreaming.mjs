import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const wsSource = readFileSync(resolve(root, 'src/services/aiWebSocket.ts'), 'utf8')
const chatSource = readFileSync(resolve(root, 'src/pages/chat/index.tsx'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/pages/home/index.tsx'), 'utf8')
const recipeSource = readFileSync(resolve(root, 'src/pages/recipe/index.tsx'), 'utf8')

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
  homeSource.includes('onInterim: (text) =>') &&
    homeSource.includes('setAnalysisResult('),
  'home nutrition analysis should render interim AI output'
)

assert(
  recipeSource.includes('onInterim: (text) =>') &&
    recipeSource.includes('setRecipeContent(text)'),
  'recipe generation should render interim AI output'
)

console.log('chat streaming checks passed')
