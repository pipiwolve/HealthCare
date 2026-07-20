import {corsHeaders, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'
import {getSubscribeTemplates, getWechatAccessToken, type ReminderKind} from '../_shared/wechat.ts'
import {buildNotificationData} from '../_shared/notification-payload.ts'

async function finishJob(job: any, status: 'sent' | 'failed', updates: Record<string, unknown>) {
  const admin = getSupabaseAdmin()
  await admin.from('notification_jobs').update({status, locked_at: null, ...updates}).eq('id', job.id)
  if (status === 'sent' || Number(job.attempts) >= 3) {
    await admin.from('reminder_settings').update({[`${job.kind}_enabled`]: false}).eq('user_id', job.user_id)
  }
}

async function dispatchJob(job: any, accessToken: string) {
  const admin = getSupabaseAdmin()
  const kind = job.kind as ReminderKind
  const config = getSubscribeTemplates()[kind]
  if (!config || config.templateId !== job.template_id) {
    await finishJob(job, 'failed', {attempts: 3, last_error: 'template configuration missing'})
    return
  }
  const {data: identity} = await admin
    .from('wechat_identities')
    .select('openid')
    .eq('provider', 'wechat_miniapp')
    .eq('user_id', job.user_id)
    .maybeSingle()
  if (!identity?.openid) {
    await finishJob(job, 'failed', {attempts: 3, last_error: 'wechat identity missing'})
    return
  }

  const values = buildNotificationData(kind, config, job.scheduled_at)
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({touser: identity.openid, template_id: config.templateId, page: config.page, data: values})
  })
  const data = await response.json().catch(() => ({}))
  if (response.ok && Number(data.errcode || 0) === 0) {
    await finishJob(job, 'sent', {sent_at: new Date().toISOString(), wechat_msg_id: data.msgid ? String(data.msgid) : null, last_error: null})
    return
  }
  const permanent = [40037, 43101, 47003].includes(Number(data.errcode))
  await finishJob(job, 'failed', {
    ...(permanent ? {attempts: 3} : {}),
    last_error: `wechat:${Number(data.errcode || response.status)}`
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const expected = Deno.env.get('WECHAT_NOTIFICATION_DISPATCH_SECRET') || ''
    if (!expected || req.headers.get('x-dispatch-secret') !== expected) throw new HttpError(401, 'Unauthorized')
    const admin = getSupabaseAdmin()
    const {data: jobs, error} = await admin.rpc('claim_due_notification_jobs', {batch_size: 50})
    if (error) throw error
    if (!jobs?.length) return json({claimed: 0, completed: 0})
    const accessToken = await getWechatAccessToken()
    for (const job of jobs) await dispatchJob(job, accessToken)
    return json({claimed: jobs.length, completed: jobs.length})
  } catch (error) {
    return handleError(error, 'wechat-notification-dispatch')
  }
})
