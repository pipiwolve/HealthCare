import {createClient, type SupabaseClient} from 'jsr:@supabase/supabase-js'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dispatch-secret',
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {...corsHeaders, 'Content-Type': 'application/json'}
  })
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !key) throw new HttpError(500, 'Supabase service configuration is missing')
  return createClient(url, key, {auth: {persistSession: false, autoRefreshToken: false}})
}

export async function getAuthUserId(req: Request, required = true): Promise<string | null> {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    if (required) throw new HttpError(401, '请先登录')
    return null
  }
  const {data, error} = await getSupabaseAdmin().auth.getUser(token)
  if (error || !data.user?.id) {
    if (required) throw new HttpError(401, '登录状态已失效')
    return null
  }
  return data.user.id
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {...init, signal: controller.signal})
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new HttpError(504, '微信服务响应超时')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function handleError(error: unknown, scope: string): Response {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Internal error'
  console.error(`[${scope}] failed`, {status, message})
  return json({message: status >= 500 ? '服务暂时不可用，请稍后重试' : message}, status)
}
