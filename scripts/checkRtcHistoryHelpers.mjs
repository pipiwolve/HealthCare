import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, 'src/utils/rtcHistory.ts')
const source = readFileSync(sourcePath, 'utf8')
const edgeSource = readFileSync(resolve(root, 'supabase/functions/brtc-history/index.ts'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/db/api.ts'), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: 99,
    target: 99,
  },
}).outputText

const moduleUrl = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
const helpers = await import(moduleUrl)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const rows = [
  {type: 'QUESTION', timestamp: 1000, text: '早餐怎么吃比较健康？'},
  {type: 'ANSWER', timestamp: 1010, text: '优先选择全谷物、鸡蛋和蔬菜。'},
  {type: 'QUESTION', timestamp: 1700, text: '午餐呢？'},
  {type: 'ANSWER', timestamp: 1710, text: '保证蛋白质和蔬菜。'},
  {type: 'QUESTION', timestamp: 3600, text: '晚餐怎么控制热量？'},
]

const groups = helpers.groupRtcDialogueRows(rows, 30 * 60)
assert(groups.length === 2, 'messages more than 30 minutes apart should start a new group')
assert(groups[0].title === '早餐怎么吃比较健康？', 'group title should use first question text')
assert(groups[0].messages.length === 4, 'nearby question/answer rows should stay in one group')
assert(groups[0].messages[0].role === 'user', 'QUESTION rows map to user messages')
assert(groups[0].messages[1].role === 'assistant', 'ANSWER rows map to assistant messages')
assert(groups[1].id === 'rtc-3600-3600', 'group id should be stable from start and end timestamps')

const fallback = helpers.groupRtcDialogueRows([
  {type: 'ANSWER', timestamp: 1, text: '你好'}
])
assert(fallback[0].title === 'AI 回复', 'answer-only group should use a readable fallback title')

assert(
  edgeSource.includes('/api/v1/dialogues') &&
    edgeSource.includes('rtc-aiagent.baidubce.com'),
  'brtc-history edge function should call the Baidu RTC dialogues endpoint'
)

assert(
  edgeSource.includes('hmacSha256Hex(signingKey, canonicalRequest)') &&
    !edgeSource.includes('hmacSha256Hex(signingKey, await sha256Hex(canonicalRequest))'),
  'BCE signature should HMAC the canonical request directly'
)

assert(
    !edgeSource.includes("jsr:@supabase/supabase-js") &&
    !edgeSource.includes('createClient(') &&
    edgeSource.includes('/auth/v1/user') &&
    edgeSource.includes('getCurrentUserId(authHeader, traceId)') &&
    edgeSource.includes('userId'),
  'brtc-history edge function should resolve userId from Supabase Auth without bundling Supabase JS'
)

assert(
  !edgeSource.includes('body.userId') &&
    !edgeSource.includes('body.user_id'),
  'brtc-history edge function must not trust a client-supplied userId'
)

assert(
  edgeSource.includes('DEFAULT_RANGE_SECONDS = 30 * 24 * 60 * 60') &&
    edgeSource.includes('DEFAULT_PAGE_SIZE = 100') &&
    edgeSource.includes('GROUP_GAP_SECONDS = 30 * 60'),
  'brtc-history edge function should default to 30 days, page size 100, and 30-minute grouping'
)

assert(
  edgeSource.includes('fetchWithTimeout') &&
    edgeSource.includes('AbortController') &&
    edgeSource.includes('AUTH_TIMEOUT_MS') &&
    edgeSource.includes('BRTC_HISTORY_TIMEOUT_MS') &&
    edgeSource.includes('jsonResponse({error:') &&
    edgeSource.includes(', 504)') &&
    edgeSource.includes('[brtc-history] baidu dialogues failed'),
  'brtc-history edge function should timeout and log Auth/Baidu upstream calls instead of hanging'
)

assert(
  apiSource.includes('isRtcHistoryUnavailable') &&
    apiSource.includes('status === 504') &&
    apiSource.includes('FunctionsFetchError') &&
    apiSource.includes('request:fail timeout') &&
    apiSource.includes('return []'),
  'miniapp RTC history API should degrade timeout and unavailable errors to an empty history list'
)

console.log('rtc history helper checks passed')
