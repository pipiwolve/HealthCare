import {corsHeaders, getAuthUserId, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'
import {codeToSession, createLoginTicket, getPhoneNumber, maskPhone, sha256, verifyLoginTicket} from '../_shared/wechat.ts'

const PROVIDER = 'wechat_miniapp'

async function findIdentity(openid: string) {
  const admin = getSupabaseAdmin()
  const {data, error} = await admin
    .from('wechat_identities')
    .select('user_id, openid, unionid, phone_number')
    .eq('provider', PROVIDER)
    .eq('openid', openid)
    .maybeSingle()
  if (error) throw error
  if (data) return data

  const {data: legacy, error: legacyError} = await admin
    .from('profiles')
    .select('id, openid')
    .eq('openid', openid)
    .maybeSingle()
  if (legacyError) throw legacyError
  if (!legacy) return null
  const {data: migrated, error: migrateError} = await admin
    .from('wechat_identities')
    .upsert({provider: PROVIDER, user_id: legacy.id, openid}, {onConflict: 'provider,openid'})
    .select('user_id, openid, unionid, phone_number')
    .single()
  if (migrateError) throw migrateError
  return migrated
}

async function generateLoginToken(userId: string): Promise<string> {
  const admin = getSupabaseAdmin()
  const {data: userData, error: userError} = await admin.auth.admin.getUserById(userId)
  const email = userData.user?.email
  if (userError || !email) throw new HttpError(500, '账号登录信息不完整')
  const {data, error} = await admin.auth.admin.generateLink({type: 'magiclink', email})
  const token = data?.properties?.hashed_token
  if (error || !token) throw new HttpError(500, '无法生成登录凭证')
  return token
}

async function handleStart(loginCode: unknown) {
  const session = await codeToSession(loginCode)
  const identity = await findIdentity(session.openid)
  if (identity) return json({status: 'authenticated', token: await generateLoginToken(identity.user_id)})
  return json({status: 'unbound', registrationTicket: await createLoginTicket(session)})
}

async function handleLegacy(code: unknown) {
  const session = await codeToSession(code)
  const identity = await findIdentity(session.openid)
  if (identity) return json({token: await generateLoginToken(identity.user_id), openid: session.openid})
  return handleRegister(await createLoginTicket(session), undefined)
}

async function handlePrepareBind(req: Request, loginCode: unknown) {
  const currentUserId = await getAuthUserId(req)
  const session = await codeToSession(loginCode)
  const identity = await findIdentity(session.openid)
  if (identity && identity.user_id !== currentUserId) throw new HttpError(409, '该微信已绑定其他账号')
  return json({registrationTicket: await createLoginTicket(session)})
}

async function handleRegister(registrationTicket: unknown, phoneCode: unknown) {
  const ticket = await verifyLoginTicket(registrationTicket)
  const existing = await findIdentity(ticket.openid)
  if (existing) return json({status: 'authenticated', token: await generateLoginToken(existing.user_id)})

  const admin = getSupabaseAdmin()
  const phone = phoneCode ? await getPhoneNumber(phoneCode) : null
  const email = `wx_${(await sha256(ticket.openid)).slice(0, 40)}@wechat.login`
  const {data: created, error: createError} = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {from: 'wechat', openid: ticket.openid}
  })
  if (createError || !created.user) throw new HttpError(500, '微信账号创建失败')

  const {error: identityError} = await admin.from('wechat_identities').insert({
    provider: PROVIDER,
    user_id: created.user.id,
    openid: ticket.openid,
    unionid: ticket.unionid || null,
    phone_number: phone
  })
  if (identityError) {
    await admin.auth.admin.deleteUser(created.user.id)
    const raced = await findIdentity(ticket.openid)
    if (raced) return json({status: 'authenticated', token: await generateLoginToken(raced.user_id)})
    throw new HttpError(409, '微信账号创建冲突，请重试')
  }
  return json({status: 'authenticated', token: await generateLoginToken(created.user.id)})
}

async function handleBind(req: Request, registrationTicket: unknown) {
  const userId = await getAuthUserId(req)
  const ticket = await verifyLoginTicket(registrationTicket)
  const admin = getSupabaseAdmin()
  const existing = await findIdentity(ticket.openid)
  if (existing && existing.user_id !== userId) throw new HttpError(409, '该微信已绑定其他账号')
  if (!existing) {
    const {error} = await admin.from('wechat_identities').insert({
      provider: PROVIDER,
      user_id: userId,
      openid: ticket.openid,
      unionid: ticket.unionid || null
    })
    if (error?.code === '23505') throw new HttpError(409, '该账号或微信已存在绑定关系')
    if (error) throw error
  }
  await admin.from('profiles').update({openid: ticket.openid}).eq('id', userId).is('openid', null)
  return json({status: 'bound'})
}

async function handleStatus(req: Request) {
  const userId = await getAuthUserId(req)
  const {data, error} = await getSupabaseAdmin()
    .from('wechat_identities')
    .select('phone_number')
    .eq('provider', PROVIDER)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return json({bound: !!data, phoneMasked: maskPhone(data?.phone_number)})
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const body = await req.json().catch(() => ({}))
    switch (body.action) {
      case 'start': return await handleStart(body.loginCode)
      case 'prepare-bind': return await handlePrepareBind(req, body.loginCode)
      case 'register': return await handleRegister(body.registrationTicket, body.phoneCode)
      case 'bind': return await handleBind(req, body.registrationTicket)
      case 'status': return await handleStatus(req)
      default:
        if (body.code) return await handleLegacy(body.code)
        throw new HttpError(400, '未知的微信账号操作')
    }
  } catch (error) {
    return handleError(error, 'wechat_miniapp_login')
  }
})
