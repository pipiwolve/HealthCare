import Taro from '@tarojs/taro'
import {supabase} from '@/client/supabase'

export type WechatStartResult =
  | {status: 'authenticated'}
  | {status: 'unbound'; registrationTicket: string}

export interface WechatAccountStatus {
  bound: boolean
  phoneMasked: string | null
}

async function getFunctionError(error: any, fallback: string): Promise<Error> {
  try {
    const text = await error?.context?.text?.()
    if (text) {
      const parsed = JSON.parse(text)
      return new Error(parsed.message || parsed.error || fallback)
    }
  } catch {}
  return new Error(error?.message || fallback)
}

async function verifyMagicLink(token: string): Promise<void> {
  const {error} = await supabase.auth.verifyOtp({token_hash: token, type: 'magiclink'})
  if (error) throw error
}

async function invokeWechat(body: Record<string, unknown>): Promise<any> {
  const {data, error} = await supabase.functions.invoke('wechat_miniapp_login', {body})
  if (error) throw await getFunctionError(error, '微信登录服务不可用')
  if (!data || typeof data !== 'object') throw new Error('微信登录服务返回异常')
  return data
}

export async function startWechatLogin(): Promise<WechatStartResult> {
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) throw new Error('仅支持微信小程序登录')
  const {code} = await Taro.login()
  if (!code) throw new Error('未获取到微信登录凭证')
  // 同时发送 code，兼容尚未升级到分阶段协议的云端函数。
  const data = await invokeWechat({action: 'start', loginCode: code, code})
  if (data.token && (!data.status || data.status === 'authenticated')) {
    await verifyMagicLink(data.token)
    return {status: 'authenticated'}
  }
  if (data.status === 'unbound' && data.registrationTicket) {
    return {status: 'unbound', registrationTicket: data.registrationTicket}
  }
  throw new Error('微信登录状态异常')
}

export async function registerWechatAccount(registrationTicket: string, phoneCode?: string): Promise<void> {
  const data = await invokeWechat({action: 'register', registrationTicket, phoneCode: phoneCode || undefined})
  if (!data.token) throw new Error('微信账号创建失败')
  await verifyMagicLink(data.token)
}

export async function bindWechatAccount(registrationTicket: string): Promise<void> {
  const data = await invokeWechat({action: 'bind', registrationTicket})
  if (data.status !== 'bound') throw new Error('微信账号绑定失败')
}

export async function prepareWechatBinding(): Promise<string> {
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) throw new Error('仅支持微信小程序绑定')
  const {code} = await Taro.login()
  if (!code) throw new Error('未获取到微信登录凭证')
  const data = await invokeWechat({action: 'prepare-bind', loginCode: code})
  if (!data.registrationTicket) throw new Error('微信绑定凭证获取失败')
  return data.registrationTicket
}

export async function getWechatAccountStatus(): Promise<WechatAccountStatus> {
  const data = await invokeWechat({action: 'status'})
  return {bound: !!data.bound, phoneMasked: data.phoneMasked || null}
}

export async function uploadWechatAvatar(localPath: string): Promise<string> {
  const fs = Taro.getFileSystemManager()
  const base64 = fs.readFileSync(localPath, 'base64') as string
  const extension = localPath.split('.').pop()?.toLowerCase() || 'jpg'
  const {data, error} = await supabase.functions.invoke('upload-avatar', {
    body: {image: base64, ext: extension}
  })
  if (error) throw await getFunctionError(error, '头像上传失败')
  if (!data?.url) throw new Error('头像上传返回异常')
  return data.url
}
