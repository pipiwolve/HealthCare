import {corsHeaders, getAuthUserId, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'

function decodeBase64(value: string): Uint8Array {
  const raw = value.includes(',') ? value.split(',')[1] : value
  const binary = atob(raw)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const userId = await getAuthUserId(req)
    const {image, ext = 'jpg'} = await req.json().catch(() => ({}))
    if (typeof image !== 'string' || !image) throw new HttpError(400, '缺少头像图片')
    const safeExt = String(ext).toLowerCase() === 'png' ? 'png' : String(ext).toLowerCase() === 'webp' ? 'webp' : 'jpg'
    const bytes = decodeBase64(image)
    if (bytes.byteLength > 2 * 1024 * 1024) throw new HttpError(400, '头像不能超过 2MB')
    const path = `${userId}/${crypto.randomUUID()}.${safeExt}`
    const contentType = safeExt === 'jpg' ? 'image/jpeg' : `image/${safeExt}`
    const admin = getSupabaseAdmin()
    const {error} = await admin.storage.from('avatars').upload(path, bytes, {contentType, upsert: false})
    if (error) throw error
    const {data} = admin.storage.from('avatars').getPublicUrl(path)
    return json({url: data.publicUrl})
  } catch (error) {
    return handleError(error, 'upload-avatar')
  }
})
