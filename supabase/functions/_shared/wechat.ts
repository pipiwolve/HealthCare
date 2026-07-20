import {fetchWithTimeout, getSupabaseAdmin, HttpError} from './common.ts'
import type {ReminderKind, WechatTemplateConfig} from './notification-payload.ts'

export type {ReminderKind, WechatTemplateConfig} from './notification-payload.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function importTicketKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('WECHAT_LOGIN_TICKET_SECRET') || ''
  if (secret.length < 32) throw new HttpError(500, 'WeChat login ticket secret is missing')
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify'])
}

export interface WechatTicketPayload {
  openid: string
  unionid?: string
  exp: number
  nonce: string
}

export async function createLoginTicket(identity: {openid: string; unionid?: string}): Promise<string> {
  const payload: WechatTicketPayload = {
    openid: identity.openid,
    ...(identity.unionid ? {unionid: identity.unionid} : {}),
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    nonce: crypto.randomUUID()
  }
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await importTicketKey(), encoder.encode(encoded))
  return `${encoded}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export async function verifyLoginTicket(ticket: unknown): Promise<WechatTicketPayload> {
  if (typeof ticket !== 'string' || !ticket.includes('.')) throw new HttpError(400, '微信登录凭证无效')
  const [encoded, signature] = ticket.split('.')
  const valid = await crypto.subtle.verify('HMAC', await importTicketKey(), base64UrlToBytes(signature), encoder.encode(encoded))
  if (!valid) throw new HttpError(400, '微信登录凭证无效')
  const payload = JSON.parse(decoder.decode(base64UrlToBytes(encoded))) as WechatTicketPayload
  if (!payload.openid || payload.exp < Math.floor(Date.now() / 1000)) throw new HttpError(400, '微信登录凭证已过期，请重试')
  return payload
}

export async function codeToSession(code: unknown): Promise<{openid: string; unionid?: string}> {
  if (typeof code !== 'string' || !code.trim()) throw new HttpError(400, '缺少微信登录凭证')
  const appId = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_ID') || ''
  const secret = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_SECRET') || ''
  if (!appId || !secret) throw new HttpError(500, 'WeChat login configuration is missing')
  const query = new URLSearchParams({appid: appId, secret, js_code: code, grant_type: 'authorization_code'})
  const response = await fetchWithTimeout(`https://api.weixin.qq.com/sns/jscode2session?${query.toString()}`, {method: 'GET'})
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.errcode || !data.openid) {
    const message = data.errcode === 40029 || data.errcode === 40163 ? '微信登录凭证已失效，请重试' : '微信身份校验失败'
    throw new HttpError(data.errcode === 40029 || data.errcode === 40163 ? 400 : 502, message)
  }
  return {openid: data.openid, ...(data.unionid ? {unionid: data.unionid} : {})}
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function getWechatAccessToken(): Promise<string> {
  const admin = getSupabaseAdmin()
  const now = new Date()
  const {data: cached} = await admin
    .from('wechat_access_tokens')
    .select('access_token, expires_at')
    .eq('token_key', 'miniapp')
    .maybeSingle()
  if (cached?.access_token && new Date(cached.expires_at).getTime() > now.getTime() + 120_000) return cached.access_token

  const appId = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_ID') || ''
  const secret = Deno.env.get('WECHAT_MINIPROGRAM_LOGIN_APP_SECRET') || ''
  if (!appId || !secret) throw new HttpError(500, 'WeChat login configuration is missing')
  const response = await fetchWithTimeout('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({grant_type: 'client_credential', appid: appId, secret, force_refresh: false})
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.errcode || !data.access_token) throw new HttpError(502, '微信服务令牌获取失败')
  const expiresAt = new Date(now.getTime() + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000).toISOString()
  await admin.from('wechat_access_tokens').upsert({token_key: 'miniapp', access_token: data.access_token, expires_at: expiresAt})
  return data.access_token
}

export async function getPhoneNumber(phoneCode: unknown): Promise<string> {
  if (typeof phoneCode !== 'string' || !phoneCode.trim()) throw new HttpError(400, '手机号授权凭证无效')
  const token = await getWechatAccessToken()
  const response = await fetchWithTimeout(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({code: phoneCode})
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.errcode || !data.phone_info?.phoneNumber) throw new HttpError(400, '手机号授权已失效，可选择跳过')
  return String(data.phone_info.phoneNumber)
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  return phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')
}

export function getSubscribeTemplates(): Partial<Record<ReminderKind, WechatTemplateConfig>> {
  const raw = Deno.env.get('WECHAT_SUBSCRIBE_TEMPLATES_JSON') || ''
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, any>
    const result: Partial<Record<ReminderKind, WechatTemplateConfig>> = {}
    for (const kind of ['breakfast', 'lunch', 'dinner', 'water'] as ReminderKind[]) {
      const item = parsed[kind]
      const base = {
        templateId: String(item?.templateId || ''),
        page: typeof item?.page === 'string' ? item.page : '/pages/home/index'
      }
      if (!base.templateId) continue
      if (kind === 'water' && item?.fields?.tip && item?.fields?.drinkTime) {
        result[kind] = {
          ...base,
          mode: 'water',
          fields: {tip: String(item.fields.tip), drinkTime: String(item.fields.drinkTime)}
        }
      } else if (kind !== 'water' && item?.fields?.menu && item?.fields?.date && item?.fields?.checkInTime) {
        result[kind] = {
          ...base,
          mode: 'meal',
          fields: {
            menu: String(item.fields.menu),
            date: String(item.fields.date),
            checkInTime: String(item.fields.checkInTime)
          }
        }
      }
    }
    return result
  } catch {
    throw new HttpError(500, 'WeChat subscribe template configuration is invalid')
  }
}
