const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AK = Deno.env.get('BAIDU_BCE_AK') || Deno.env.get('BAIDU_BRTC_AK') || ''
const SK = Deno.env.get('BAIDU_BCE_SK') || Deno.env.get('BAIDU_BRTC_SK') || ''
const APPID = Deno.env.get('BAIDU_BRTC_APPID') || 'appsf7sknqh440y'
const SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('APP_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
const LICENSE_KEY = Deno.env.get('BAIDU_BRTC_LICENSE_KEY') || ''
const LICENSE_DEVICE_ID = Deno.env.get('BAIDU_BRTC_LICENSE_DEVICE_ID') || 'codex-ws-vision-test-20260624-v1'
const WS_GATEWAY = 'wss://rtc-aiotgw.exp.bcelive.com/v1/realtime'
const API_HOST = 'rtc-aiagent.baidubce.com'
const CREATE_AGENT_PATH = '/api/v1/aiagent/generateAIAgentCall'
const AUTH_TIMEOUT_MS = 5000
const CREATE_AGENT_TIMEOUT_MS = 15000
const encoder = new TextEncoder()

type AgentProfile = 'chat' | 'vision' | 'voice-realtime' | 'voice-ptt'

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {...init, signal: controller.signal})
  } finally {
    clearTimeout(timer)
  }
}

function safeUserId(value: unknown): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : `miniapp-${crypto.randomUUID()}`
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `miniapp-${crypto.randomUUID()}`
}

async function getCurrentUserId(authHeader: string): Promise<string | null> {
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null

  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
    },
    AUTH_TIMEOUT_MS,
  )
  if (!response.ok) return null

  const user = await response.json().catch(() => null)
  return typeof user?.id === 'string' && user.id ? user.id : null
}

function parseConfigOverride(): Record<string, unknown> {
  const raw = Deno.env.get('BAIDU_RTC_AGENT_CONFIG') || ''
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    console.warn('[ws-sign] BAIDU_RTC_AGENT_CONFIG is not valid JSON; using built-in default agent config')
    return {}
  }
}

function buildDefaultAgentConfig(profile: AgentProfile, userId: string): Record<string, unknown> {
  const isPushToTalk = profile === 'voice-ptt'
  const basePrompt = Deno.env.get('BAIDU_RTC_AGENT_PROMPT') ||
    '你是微信小程序里的智能健康顾问。请用简洁、友好、可执行的中文回答用户，聚焦饮食、营养、食材识别和健康管理。不要做医疗诊断；遇到疾病、用药或高风险症状时提醒用户咨询医生或营养师。'

  return {
    sceneRoleCfg: {
      name: Deno.env.get('BAIDU_RTC_AGENT_ROLE_NAME') || '智能健康顾问',
      prompt: basePrompt,
      model: Deno.env.get('BAIDU_RTC_AGENT_MODEL') || 'DEFAULT',
    },
    lang: 'zh',
    audiocodec: 'raw16k',
    user_id: userId,
    asr_long_audio_mode: isPushToTalk,
    asr_vad_append: true,
    asr_vad: Number(Deno.env.get('BAIDU_RTC_AGENT_ASR_VAD_MS') || 300),
    asr_vad_wait_ms: Number(Deno.env.get('BAIDU_RTC_AGENT_ASR_VAD_WAIT_MS') || 800),
    tts_end_delay_ms: Number(Deno.env.get('BAIDU_RTC_AGENT_TTS_END_DELAY_MS') || 120),
    ...parseConfigOverride(),
  }
}

async function createDefaultAgent(profile: AgentProfile, userId: string) {
  const config = buildDefaultAgentConfig(profile, userId)
  const body = JSON.stringify({
    app_id: APPID,
    instance_type: 'VoiceChat',
    config: JSON.stringify(config),
  })
  const authorization = await buildBceAuthorization('POST', CREATE_AGENT_PATH, new URLSearchParams(), API_HOST)
  const startedAt = Date.now()
  const response = await fetchWithTimeout(`https://${API_HOST}${CREATE_AGENT_PATH}`, {
    method: 'POST',
    headers: {
      host: API_HOST,
      authorization,
      'content-type': 'application/json',
    },
    body,
  }, CREATE_AGENT_TIMEOUT_MS)
  const text = await response.text()
  console.info('[ws-sign] create default agent responded', {
    status: response.status,
    profile,
    elapsedMs: Date.now() - startedAt,
  })
  if (!response.ok) throw new Error(`create default agent failed: ${response.status} ${text}`)

  const payload = JSON.parse(text)
  const id = payload.ai_agent_instance_id ?? payload.data?.ai_agent_instance_id
  const token = payload.context?.token ?? payload.data?.context?.token
  if (!id || !token) throw new Error('create default agent returned empty id/token')
  return {id: String(id), token: String(token)}
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, {headers: corsHeaders})
  if (req.method !== 'POST') return new Response('Method Not Allowed', {status: 405, headers: corsHeaders})

  try {
    const {agentProfile = 'chat'} = await req.json().catch(() => ({}))
    if (!AK || !SK || !APPID) throw new Error('Missing BRTC credentials')

    const userId = await getCurrentUserId(req.headers.get('Authorization') || '')
    if (!userId) {
      return new Response(
        JSON.stringify({error: 'Unauthorized'}),
        {status: 401, headers: {...corsHeaders, 'Content-Type': 'application/json'}},
      )
    }

    const profile = ['chat', 'vision', 'voice-realtime', 'voice-ptt'].includes(agentProfile)
      ? agentProfile as AgentProfile
      : 'chat'
    const agent = await createDefaultAgent(profile, safeUserId(userId))
    const params = new URLSearchParams({
      a: APPID,
      id: agent.id,
      t: agent.token,
      ac: 'raw16k',
    })

    return new Response(
      JSON.stringify({
        url: `${WS_GATEWAY}?${params.toString()}`,
        licenseKey: LICENSE_KEY,
        licenseDeviceId: LICENSE_DEVICE_ID,
        agentProfile: profile,
        userId,
      }),
      {status: 200, headers: {...corsHeaders, 'Content-Type': 'application/json'}},
    )
  } catch (e) {
    console.error('[ws-sign] failed', e instanceof Error ? e.message : String(e))
    return new Response(
      JSON.stringify({error: e instanceof Error ? e.message : 'Internal error'}),
      {status: 400, headers: {...corsHeaders, 'Content-Type': 'application/json'}},
    )
  }
})
