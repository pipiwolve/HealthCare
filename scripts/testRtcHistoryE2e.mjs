import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = resolve(import.meta.dirname, '..')
const envText = readFileSync(resolve(root, '.env'), 'utf8')

function readEnv(name) {
  const match = envText.match(new RegExp(`^${name}=(.*)$`, 'm'))
  return match?.[1]?.trim().replace(/^"|"$/g, '') || process.env[name] || ''
}

const supabaseUrl = readEnv('TARO_APP_SUPABASE_URL')
const supabaseAnonKey = readEnv('TARO_APP_SUPABASE_ANON_KEY')
const questions = [
  '端到端测试一：请用一句话回答，苹果适合作为早餐水果吗？',
  '端到端测试二：请用一句话回答，鸡蛋主要提供什么营养？',
  '端到端测试三：请用一句话回答，晚餐如何简单控制热量？',
]
const historyGapSeconds = Number(process.env.RTC_HISTORY_TEST_GAP_SECONDS || 30 * 60)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function makeSession() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const stamp = Date.now()
  const email = `codex-rtc-history-${stamp}@miaoda.com`
  const password = `CodexRtc${stamp}!`
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: `codex_rtc_${stamp}` } },
  })
  if (signUpError) throw signUpError
  if (signUpData.session?.access_token) {
    return {
      supabase,
      email,
      userId: signUpData.session.user.id,
      accessToken: signUpData.session.access_token,
    }
  }

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  assert(signInData.session?.access_token, 'Supabase Auth did not return a session for the test user')
  return {
    supabase,
    email,
    userId: signInData.session.user.id,
    accessToken: signInData.session.access_token,
  }
}

async function invokeFunction(name, accessToken, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  })
  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }
  if (!response.ok) {
    throw new Error(`${name} failed: ${response.status} ${text}`)
  }
  return payload
}

async function invokeFunctionWithRetry(name, accessToken, body, attempts = 3) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await invokeFunction(name, accessToken, body)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      console.warn(`[retry] ${name} attempt ${attempt} failed: ${error.message}`)
      await wait(2000 * attempt)
    }
  }
  throw lastError
}

function waitForSocketOpen(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 15000)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
    ws.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('WebSocket open error'))
    }, { once: true })
  })
}

async function sendRtcQuestion(accessToken, question, index) {
  const sign = await invokeFunctionWithRetry('ws-sign', accessToken, { agentProfile: 'chat' })
  assert(sign.url, 'ws-sign returned no url')
  assert(sign.userId, 'ws-sign returned no server-resolved userId')

  const ws = new WebSocket(sign.url)
  let ready = false
  let final = ''
  let interim = ''
  let licenseRequired = false

  const completed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`RTC answer timeout for question ${index}`)), 90000)
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      const msg = event.data
      console.log(`[rtc:${index}] ${msg.slice(0, 100)}`)
      if (msg.startsWith('[E]:[LIC]:[MUST]')) {
        licenseRequired = true
        if (sign.licenseKey) {
          ws.send(`[E]:[LIC]:[ACTIVE]:${JSON.stringify({
            devId: sign.licenseDeviceId || `codex-rtc-history-${Date.now()}`,
            uId: sign.userId,
            licKey: sign.licenseKey,
          })}`)
        }
      } else if (msg.startsWith('[E]:[MEDIA]:[READY]') && !licenseRequired) {
        setTimeout(() => {
          if (ready) return
          ready = true
          ws.send(`[SET]:[DEVICE_INFO]:${JSON.stringify({ user_id: sign.userId, userId: sign.userId })}`)
          ws.send(`[T]:${question}`)
        }, sign.licenseKey ? 900 : 0)
      } else if (msg.startsWith('[E]:[LIC]:[RES]:')) {
        if (ready) return
        ready = true
        ws.send(`[SET]:[DEVICE_INFO]:${JSON.stringify({ user_id: sign.userId, userId: sign.userId })}`)
        ws.send(`[T]:${question}`)
      } else if (msg.startsWith('[A]:[M]:')) {
        interim = msg.slice(8)
      } else if (msg.startsWith('[A]:')) {
        final = msg.slice(4)
        clearTimeout(timeout)
        resolve(final || interim)
      }
    })
    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error(`RTC socket error for question ${index}`))
    }, { once: true })
  })

  await waitForSocketOpen(ws)
  const answer = await completed
  ws.close()
  return { answer, userId: sign.userId }
}

const beginTime = Math.floor(Date.now() / 1000) - 120
const session = await makeSession()
console.log('[auth] test user created', { email: session.email, userId: session.userId })

let rtcUserId = ''
for (let i = 0; i < questions.length; i += 1) {
  const result = await sendRtcQuestion(session.accessToken, questions[i], i + 1)
  rtcUserId = result.userId
  console.log(`[answer:${i + 1}]`, result.answer.slice(0, 160))
  if (i < questions.length - 1) {
    const waitMs = (historyGapSeconds + 5) * 1000
    console.log(`[wait] waiting ${Math.round(waitMs / 1000)}s so the next question is split by the history window`)
    await wait(waitMs)
  }
}

console.log('[wait] waiting 20s for RTC history persistence')
await wait(20000)

const history = await invokeFunctionWithRetry('brtc-history', session.accessToken, {
  beginTime,
  endTime: Math.floor(Date.now() / 1000) + 60,
  pageNo: 1,
  pageSize: 100,
})

console.log('[history]', JSON.stringify({
  source: history.source,
  groupGapSeconds: history.groupGapSeconds,
  historyLimit: history.historyLimit,
  pageNo: history.pageNo,
  pageSize: history.pageSize,
  groupCount: history.groups?.length || 0,
  rtcUserId,
}, null, 2))

for (const [index, group] of (history.groups || []).entries()) {
  console.log(`[group:${index + 1}]`, JSON.stringify({
    id: group.id,
    title: group.title,
    startTime: group.startTime,
    endTime: group.endTime,
    messageCount: group.messages?.length || 0,
    firstMessage: group.messages?.[0]?.content?.slice(0, 80),
  }, null, 2))
}

assert(history.groupGapSeconds === historyGapSeconds, `brtc-history did not report a ${historyGapSeconds} second grouping window`)
assert((history.groups?.length || 0) >= 2, 'expected at least 2 RTC history groups after spaced questions')
console.log('rtc history e2e checks passed')
