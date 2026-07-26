import {corsHeaders, getAuthUserId, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'

const BUCKET = 'chat-images'
const LARGE_MAX_BYTES = 300 * 1024
const THUMBNAIL_MAX_BYTES = 50 * 1024
const LARGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function decodeJpeg(value: unknown, label: string, maxBytes: number): Uint8Array {
  if (typeof value !== 'string' || !value) throw new HttpError(400, `缺少${label}`)
  if (value.length > Math.ceil(maxBytes * 4 / 3) + 256) throw new HttpError(400, `${label}超过大小限制`)
  try {
    const raw = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
    const binary = atob(raw)
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    if (bytes.byteLength > maxBytes) throw new HttpError(400, `${label}超过大小限制`)
    if (bytes.byteLength < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new HttpError(400, `${label}必须为 JPEG 格式`)
    }
    return bytes
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, `${label}编码无效`)
  }
}

function safeDimension(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10000 ? Math.round(parsed) : null
}

async function uploadImages(userId: string, body: Record<string, unknown>): Promise<Response> {
  const largeBytes = decodeJpeg(body.largeImage, '大图', LARGE_MAX_BYTES)
  const thumbnailBytes = decodeJpeg(body.thumbnailImage, '缩略图', THUMBNAIL_MAX_BYTES)
  const imageId = crypto.randomUUID()
  const largePath = `${userId}/${imageId}/large.jpg`
  const thumbnailPath = `${userId}/${imageId}/thumb.jpg`
  const largeExpiresAt = new Date(Date.now() + LARGE_RETENTION_MS).toISOString()
  const largeMeta = body.largeMeta && typeof body.largeMeta === 'object' ? body.largeMeta as Record<string, unknown> : {}
  const thumbnailMeta = body.thumbnailMeta && typeof body.thumbnailMeta === 'object' ? body.thumbnailMeta as Record<string, unknown> : {}
  const admin = getSupabaseAdmin()

  const {error: largeError} = await admin.storage.from(BUCKET).upload(largePath, largeBytes, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (largeError) throw largeError

  const {error: thumbnailError} = await admin.storage.from(BUCKET).upload(thumbnailPath, thumbnailBytes, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (thumbnailError) {
    await admin.storage.from(BUCKET).remove([largePath])
    throw thumbnailError
  }

  const {error: metadataError} = await admin.from('food_images').insert({
    id: imageId,
    user_id: userId,
    large_path: largePath,
    thumbnail_path: thumbnailPath,
    large_bytes: largeBytes.byteLength,
    thumbnail_bytes: thumbnailBytes.byteLength,
    large_width: safeDimension(largeMeta.width),
    large_height: safeDimension(largeMeta.height),
    thumbnail_width: safeDimension(thumbnailMeta.width),
    thumbnail_height: safeDimension(thumbnailMeta.height),
    large_expires_at: largeExpiresAt,
  })
  if (metadataError) {
    await admin.storage.from(BUCKET).remove([largePath, thumbnailPath])
    throw metadataError
  }

  const largeUrl = admin.storage.from(BUCKET).getPublicUrl(largePath).data.publicUrl
  const thumbnailUrl = admin.storage.from(BUCKET).getPublicUrl(thumbnailPath).data.publicUrl
  return json({imageId, largeUrl, thumbnailUrl, largeExpiresAt})
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const userId = await getAuthUserId(req)
    const parsedBody = await req.json().catch(() => ({}))
    const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? parsedBody as Record<string, unknown>
      : {}
    return await uploadImages(userId!, body)
  } catch (error) {
    return handleError(error, 'upload-food-image')
  }
})
