import {corsHeaders, getAuthUserId, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'
import {codeToSession, createLoginTicket, maskPhone, sha256, verifyLoginTicket} from '../_shared/wechat.ts'

const PROVIDER = 'wechat_miniapp'
const USERNAME_EMAIL_DOMAIN = '@miaoda.com'

function normalizePassword(value: unknown): string {
  const password = typeof value === 'string' ? value : ''
  if (password.length < 6 || password.length > 72) throw new HttpError(400, '密码需为6-72位')
  return password
}

function isUsernameLoginEmail(email: string | null | undefined): boolean {
  return !!email?.toLowerCase().endsWith(USERNAME_EMAIL_DOMAIN)
}

function isPasswordLoginEmail(email: string | null | undefined): boolean {
  return !!email && !email.toLowerCase().endsWith('@wechat.login')
}

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
  // 微信快捷登录本身就是一种完整登录方式。首次使用时直接创建微信账号，
  // 不要求用户先准备邮箱账号；邮箱绑定仍可在账号设置中作为可选操作完成。
  const registrationTicket = await createLoginTicket(session)
  const result = await handleLegacyRegister(registrationTicket)
  const payload = await result.json()
  if (payload.status !== 'authenticated' || !payload.token) throw new HttpError(500, '微信账号创建失败')
  return json({status: 'authenticated', token: payload.token, needsProfile: true, registrationTicket})
}

async function handleLegacy(code: unknown) {
  const session = await codeToSession(code)
  const identity = await findIdentity(session.openid)
  if (identity) return json({token: await generateLoginToken(identity.user_id), openid: session.openid})
  return handleLegacyRegister(await createLoginTicket(session))
}

async function handlePrepareBind(req: Request, loginCode: unknown) {
  const currentUserId = await getAuthUserId(req)
  const session = await codeToSession(loginCode)
  const identity = await findIdentity(session.openid)
  if (identity && identity.user_id !== currentUserId) throw new HttpError(409, '该微信已绑定其他账号')
  const {data: currentIdentity, error} = await getSupabaseAdmin()
    .from('wechat_identities')
    .select('openid')
    .eq('provider', PROVIDER)
    .eq('user_id', currentUserId)
    .maybeSingle()
  if (error) throw error
  if (currentIdentity && currentIdentity.openid !== session.openid) {
    throw new HttpError(409, '当前账号已绑定其他微信，请先解绑')
  }
  return json({registrationTicket: await createLoginTicket(session)})
}

async function handleLegacyRegister(registrationTicket: unknown) {
  const ticket = await verifyLoginTicket(registrationTicket)
  const existing = await findIdentity(ticket.openid)
  if (existing) return json({status: 'authenticated', token: await generateLoginToken(existing.user_id)})

  const admin = getSupabaseAdmin()
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
    phone_number: null
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
  const {data: currentIdentity, error: currentIdentityError} = await admin
    .from('wechat_identities')
    .select('openid')
    .eq('provider', PROVIDER)
    .eq('user_id', userId)
    .maybeSingle()
  if (currentIdentityError) throw currentIdentityError
  if (currentIdentity && currentIdentity.openid !== ticket.openid) {
    throw new HttpError(409, '当前账号已绑定其他微信，请先解绑')
  }
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

async function verifyPassword(userId: string, email: string, passwordValue: unknown): Promise<void> {
  const password = normalizePassword(passwordValue)
  const url = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('APP_SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!url || !anonKey) throw new HttpError(500, 'Supabase authentication configuration is missing')
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', apikey: anonKey},
    body: JSON.stringify({email, password})
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.user?.id !== userId) throw new HttpError(401, '密码验证失败')
}

async function handleUnbind(req: Request, passwordValue: unknown) {
  const userId = await getAuthUserId(req)
  const admin = getSupabaseAdmin()
  const {data: userData, error: userError} = await admin.auth.admin.getUserById(userId)
  const email = userData.user?.email
  if (userError || !email) throw new HttpError(401, '登录状态已失效')
  if (!isPasswordLoginEmail(email)) throw new HttpError(409, '请先设置用户名或邮箱密码，再解绑微信')
  await verifyPassword(userId, email, passwordValue)

  const {error: profileError} = await admin.from('profiles').update({openid: null}).eq('id', userId)
  if (profileError) throw profileError
  const {error: deleteError} = await admin
    .from('wechat_identities')
    .delete()
    .eq('provider', PROVIDER)
    .eq('user_id', userId)
  if (deleteError) throw deleteError
  return json({status: 'unbound'})
}

async function handleStatus(req: Request) {
  const userId = await getAuthUserId(req)
  const admin = getSupabaseAdmin()
  const {data, error} = await admin
    .from('wechat_identities')
    .select('phone_number')
    .eq('provider', PROVIDER)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  const {data: userData, error: userError} = await admin.auth.admin.getUserById(userId)
  if (userError || !userData.user) throw new HttpError(401, '登录状态已失效')
  const email = userData.user.email
  const hasUsernameLogin = isUsernameLoginEmail(email)
  const hasPasswordLogin = isPasswordLoginEmail(email)
  const loginType = hasUsernameLogin ? 'username' : hasPasswordLogin ? 'email' : null
  const loginIdentifier = hasUsernameLogin
    ? email?.slice(0, -USERNAME_EMAIL_DOMAIN.length) || null
    : hasPasswordLogin ? email || null : null
  return json({
    bound: !!data,
    phoneMasked: maskPhone(data?.phone_number),
    hasPasswordLogin,
    loginType,
    loginIdentifier,
    // Keep these aliases for clients deployed before email registration was added.
    hasUsernameLogin: hasPasswordLogin,
    username: loginIdentifier
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const body = await req.json().catch(() => ({}))
    switch (body.action) {
      case 'start': return await handleStart(body.loginCode)
      case 'prepare-bind': return await handlePrepareBind(req, body.loginCode)
      case 'register': throw new HttpError(409, '请先注册或登录账号，再绑定微信')
      case 'bind': return await handleBind(req, body.registrationTicket)
      case 'unbind': return await handleUnbind(req, body.password)
      case 'status': return await handleStatus(req)
      default:
        if (body.code) return await handleLegacy(body.code)
        throw new HttpError(400, '未知的微信账号操作')
    }
  } catch (error) {
    return handleError(error, 'wechat_miniapp_login')
  }
})
