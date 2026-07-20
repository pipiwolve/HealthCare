type DialogueRow = {
  type: string
  timestamp: number | string
  text: string
}

type HistoryMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

type HistoryGroup = {
  id: string
  title: string
  startTime: number
  endTime: number
  messages: HistoryMessage[]
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AK = Deno.env.get('BAIDU_BCE_AK') || Deno.env.get('BAIDU_BRTC_AK') || ''
const SK = Deno.env.get('BAIDU_BCE_SK') || Deno.env.get('BAIDU_BRTC_SK') || ''
const APPID = Deno.env.get('BAIDU_BRTC_APPID') || 'appsf7sknqh440y'
const SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('APP_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
const API_HOST = 'rtc-aiagent.baidubce.com'
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_RANGE_SECONDS = 30 * 24 * 60 * 60
const GROUP_GAP_SECONDS = 30 * 60
const MAX_HISTORY_GROUPS = 10
const AUTH_TIMEOUT_MS = 5000
const BRTC_HISTORY_TIMEOUT_MS = 8000

const encoder = new TextEncoder()

function normalizeTimestamp(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)))
}

async function hmacSha256Hex(key: string, text: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(text)))
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {...init, signal: controller.signal})
  } finally {
    clearTimeout(timer)
  }
}

function normalizeQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

async function buildBceAuthorization(method: string, path: string, query: URLSearchParams, host: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const expiration = 1800
  const authStringPrefix = `bce-auth-v1/${AK}/${timestamp}/${expiration}`
  const signingKey = await hmacSha256Hex(SK, authStringPrefix)
  const canonicalHeaders = `host:${host}`
  const canonicalRequest = [
    method.toUpperCase(),
    encodeURI(path),
    normalizeQuery(query),
    canonicalHeaders,
  ].join('\n')
  const signature = await hmacSha256Hex(signingKey, canonicalRequest)
  return `${authStringPrefix}/host/${signature}`
}

function buildTitle(messages: HistoryMessage[]): string {
  const question = messages.find(message => message.role === 'user' && message.content.trim())
  if (!question) return messages.some(message => message.content.trim()) ? 'AI 回复' : '云端对话'
  return question.content.trim().slice(0, 20)
}

function normalizeQuestionText(text: string): string {
  const source = (text || '').replace(/\\n/g, '\n').trim()
  if (!source) return ''

  const markerMatch = source.match(/用户问题[:：]\s*([\s\S]+)$/)
  if (markerMatch?.[1]) {
    return markerMatch[1].trim()
  }

  const hiddenQuestionPrefixes = [
    '你是专业健康饮食顾问',
    '请用不超过',
    '请使用简单 Markdown 输出',
    '不要输出长篇食谱',
    '不能给出医疗诊断',
    '请先请求上传图片',
    '图片已上传完成',
    '识别图片中的食材',
    '只输出食材名',
    '【本餐用餐成员健康档案】',
    '请分析以下食材',
  ]
  if (hiddenQuestionPrefixes.some(prefix => source.startsWith(prefix))) return ''
  if (source.includes('请分析以下食材的营养成分')) return ''
  return source
}

function normalizeDialogueText(row: DialogueRow): string {
  if (row.type === 'QUESTION') return normalizeQuestionText(row.text || '')
  return (row.text || '').trim()
}

function groupRows(rows: DialogueRow[]): HistoryGroup[] {
  const sortedRows = [...rows].sort((a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp))
  const messages: HistoryMessage[] = []
  let skipAnswerForHiddenQuestion = false

  for (const row of sortedRows) {
    const role = row.type === 'QUESTION' ? 'user' as const : 'assistant' as const
    const content = normalizeDialogueText(row)
    if (role === 'user') {
      skipAnswerForHiddenQuestion = !content.trim()
      if (!content.trim()) continue
    } else if (skipAnswerForHiddenQuestion) {
      skipAnswerForHiddenQuestion = false
      continue
    }
    if (!content.trim()) continue
    messages.push({
      role,
      content,
      timestamp: normalizeTimestamp(row.timestamp),
    })
  }

  const groups: HistoryGroup[] = []
  let current: HistoryMessage[] = []

  for (const message of messages) {
    const previous = current[current.length - 1]
    if (previous && message.timestamp - previous.timestamp > GROUP_GAP_SECONDS) {
      const startTime = current[0].timestamp
      const endTime = current[current.length - 1].timestamp
      groups.push({id: `rtc-${startTime}-${endTime}`, title: buildTitle(current), startTime, endTime, messages: current})
      current = []
    }
    current.push(message)
  }

  if (current.length > 0) {
    const startTime = current[0].timestamp
    const endTime = current[current.length - 1].timestamp
    groups.push({id: `rtc-${startTime}-${endTime}`, title: buildTitle(current), startTime, endTime, messages: current})
  }

  return groups.sort((a, b) => b.endTime - a.endTime)
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, 'Content-Type': 'application/json'},
  })
}

async function getCurrentUserId(authHeader: string, traceId: string): Promise<string | null> {
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null

  const startedAt = Date.now()
  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
    },
    AUTH_TIMEOUT_MS,
  )
  console.info('[brtc-history] supabase auth checked', {
    traceId,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
  })
  if (!response.ok) return null

  const user = await response.json().catch(() => null)
  return typeof user?.id === 'string' && user.id ? user.id : null
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, {headers: corsHeaders})
  if (req.method !== 'POST') return new Response('Method Not Allowed', {status: 405, headers: corsHeaders})

  const traceId = crypto.randomUUID()
  const startedAt = Date.now()

  try {
    if (!AK || !SK || !APPID) throw new Error('Missing BRTC credentials')

    const authHeader = req.headers.get('Authorization') || ''
    let userId: string | null = null
    try {
      userId = await getCurrentUserId(authHeader, traceId)
    } catch (error) {
      console.error('[brtc-history] supabase auth failed', {
        traceId,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({error: 'AUTH_TIMEOUT', traceId}, 504)
    }
    if (!userId) {
      return jsonResponse({error: 'Unauthorized', traceId}, 401)
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const body = await req.json().catch(() => ({}))
    const beginTime = Number.isFinite(Number(body.beginTime)) ? Number(body.beginTime) : nowSeconds - DEFAULT_RANGE_SECONDS
    const endTime = Number.isFinite(Number(body.endTime)) ? Number(body.endTime) : nowSeconds
    const pageNo = Math.max(1, Number.isFinite(Number(body.pageNo)) ? Number(body.pageNo) : 1)
    const pageSize = Math.min(100, Math.max(1, Number.isFinite(Number(body.pageSize)) ? Number(body.pageSize) : DEFAULT_PAGE_SIZE))

    console.info('[brtc-history] request accepted', {
      traceId,
      pageNo,
      pageSize,
      beginTime: Math.floor(beginTime),
      endTime: Math.floor(endTime),
    })

    const path = '/api/v1/dialogues'
    const query = new URLSearchParams({
      appId: APPID,
      userId,
      pageNo: String(pageNo),
      pageSize: String(pageSize),
      beginTime: String(Math.floor(beginTime)),
      endTime: String(Math.floor(endTime)),
    })
    const signStartedAt = Date.now()
    const authorization = await buildBceAuthorization('GET', path, query, API_HOST)
    console.info('[brtc-history] bce auth built', {
      traceId,
      elapsedMs: Date.now() - signStartedAt,
    })

    const upstreamStartedAt = Date.now()
    let upstream: Response
    try {
      upstream = await fetchWithTimeout(`https://${API_HOST}${path}?${normalizeQuery(query)}`, {
        method: 'GET',
        headers: {
          host: API_HOST,
          authorization,
        },
      }, BRTC_HISTORY_TIMEOUT_MS)
    } catch (error) {
      console.error('[brtc-history] baidu dialogues failed', {
        traceId,
        elapsedMs: Date.now() - upstreamStartedAt,
        error: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({error: 'BRTC_HISTORY_TIMEOUT', traceId}, 504)
    }
    const responseText = await upstream.text()
    console.info('[brtc-history] baidu dialogues responded', {
      traceId,
      status: upstream.status,
      elapsedMs: Date.now() - upstreamStartedAt,
    })
    if (!upstream.ok) {
      return jsonResponse({error: `BRTC history failed: ${upstream.status} ${responseText}`, traceId}, 502)
    }

    const payload = JSON.parse(responseText)
    const rows = Array.isArray(payload.data) ? payload.data as DialogueRow[] : []
    const allGroups = groupRows(rows)
    const groups = allGroups.slice(0, MAX_HISTORY_GROUPS)

    console.info('[brtc-history] completed', {
      traceId,
      rowCount: rows.length,
      totalGroupCount: allGroups.length,
      groupCount: groups.length,
      historyLimit: MAX_HISTORY_GROUPS,
      elapsedMs: Date.now() - startedAt,
    })

    return new Response(JSON.stringify({
      pageNo: payload.pageNo ?? pageNo,
      pageSize: payload.pageSize ?? rows.length,
      source: 'baidu-rtc-dialogues',
      groupGapSeconds: GROUP_GAP_SECONDS,
      historyLimit: MAX_HISTORY_GROUPS,
      groups,
    }), {
      status: 200,
      headers: {...corsHeaders, 'Content-Type': 'application/json'},
    })
  } catch (error) {
    console.error('[brtc-history] internal error', {
      traceId,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonResponse({error: error instanceof Error ? error.message : 'Internal error', traceId}, 500)
  }
})
