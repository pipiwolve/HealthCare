import {corsHeaders, getAuthUserId, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'
import {getSubscribeTemplates, type ReminderKind} from '../_shared/wechat.ts'

const KINDS: ReminderKind[] = ['breakfast', 'lunch', 'dinner', 'water']

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function nextShanghaiOccurrence(time: string): string {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now)
  const read = (type: string) => parts.find(part => part.type === type)?.value || ''
  const candidate = new Date(`${read('year')}-${read('month')}-${read('day')}T${time}:00+08:00`)
  if (candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1)
  return candidate.toISOString()
}

async function saveSettings(req: Request, body: any) {
  const userId = await getAuthUserId(req)
  const admin = getSupabaseAdmin()
  const templates = getSubscribeTemplates()
  const accepted = new Set(Array.isArray(body.acceptedKinds) ? body.acceptedKinds.filter((kind: unknown) => KINDS.includes(kind as ReminderKind)) : [])
  const incoming = body.settings && typeof body.settings === 'object' ? body.settings : {}
  const normalized: Record<string, unknown> = {user_id: userId, updated_at: new Date().toISOString()}

  for (const kind of KINDS) {
    const enabledKey = `${kind}_enabled`
    const timeKey = `${kind}_time`
    const time = validTime(incoming[timeKey]) ? incoming[timeKey] : ({breakfast: '07:30', lunch: '12:00', dinner: '18:30', water: '09:00'} as const)[kind]
    const wantsEnabled = incoming[enabledKey] === true
    normalized[timeKey] = time

    const {data: activeJob} = await admin
      .from('notification_jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('kind', kind)
      .in('status', ['pending', 'processing', 'failed'])
      .maybeSingle()

    if (!wantsEnabled) {
      normalized[enabledKey] = false
      if (activeJob) await admin.from('notification_jobs').update({status: 'cancelled', locked_at: null}).eq('id', activeJob.id)
      continue
    }

    const template = templates[kind]
    if (!template) {
      normalized[enabledKey] = false
      continue
    }
    if (!activeJob && !accepted.has(kind)) {
      normalized[enabledKey] = false
      continue
    }

    normalized[enabledKey] = true
    const job = {
      user_id: userId,
      kind,
      template_id: template.templateId,
      scheduled_at: nextShanghaiOccurrence(time),
      status: 'pending',
      attempts: 0,
      locked_at: null,
      last_error: null
    }
    if (activeJob) {
      const {error} = await admin.from('notification_jobs').update(job).eq('id', activeJob.id)
      if (error) throw error
    } else {
      const {error} = await admin.from('notification_jobs').insert(job)
      if (error) throw error
    }
  }

  const {data: settings, error} = await admin
    .from('reminder_settings')
    .upsert(normalized, {onConflict: 'user_id'})
    .select('*')
    .single()
  if (error) throw error
  return json({settings})
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const body = await req.json().catch(() => ({}))
    await getAuthUserId(req)
    if (body.action === 'templates') {
      const templates = getSubscribeTemplates()
      return json({templates: Object.fromEntries(KINDS.flatMap(kind => templates[kind] ? [[kind, templates[kind]!.templateId]] : []))})
    }
    if (body.action === 'save') return await saveSettings(req, body)
    throw new HttpError(400, '未知的提醒操作')
  } catch (error) {
    return handleError(error, 'wechat-notification-schedule')
  }
})
