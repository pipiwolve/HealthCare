export const FOOD_IMAGE_LARGE_MAX_EDGE = 1280
export const FOOD_IMAGE_LARGE_MAX_BYTES = 300 * 1024
export const FOOD_IMAGE_THUMB_MAX_EDGE = 320
export const FOOD_IMAGE_THUMB_TARGET_BYTES = 40 * 1024
export const FOOD_IMAGE_THUMB_MAX_BYTES = 50 * 1024

export interface FoodImageFields {
  image_id?: string | null
  image_url?: string | null
  thumbnail_url?: string | null
  image_expires_at?: string | null
}

export interface FoodImageDisplay {
  listUrl: string | null
  previewUrl: string | null
  largeExpired: boolean
}

export function scaleImageDimensions(width: number, height: number, maxEdge: number): {width: number; height: number} {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const longest = Math.max(safeWidth, safeHeight)
  if (longest <= maxEdge) return {width: safeWidth, height: safeHeight}
  const ratio = maxEdge / longest
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  }
}

export function nextCompressionQuality(currentQuality: number, byteSize: number, maxBytes: number, minQuality: number): number {
  if (byteSize <= maxBytes) return currentQuality
  const ratio = maxBytes / Math.max(1, byteSize)
  const step = ratio < 0.5 ? 18 : ratio < 0.75 ? 12 : 8
  return Math.max(minQuality, currentQuality - step)
}

export function canReuseSourceAsLarge(width: number, height: number, byteSize: number, imageType: string): boolean {
  const normalizedType = imageType.toLowerCase()
  return (
    (normalizedType === 'jpg' || normalizedType === 'jpeg') &&
    Math.max(width, height) <= FOOD_IMAGE_LARGE_MAX_EDGE &&
    byteSize <= FOOD_IMAGE_LARGE_MAX_BYTES
  )
}

export function isRemoteImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function getFoodImageDisplay(image: FoodImageFields, nowMs = Date.now()): FoodImageDisplay {
  const largeUrl = isRemoteImageUrl(image.image_url) ? image.image_url : null
  const thumbnailUrl = isRemoteImageUrl(image.thumbnail_url) ? image.thumbnail_url : null
  const expiresAtMs = image.image_expires_at ? Date.parse(image.image_expires_at) : Number.NaN
  const largeExpired = Boolean(largeUrl && Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs)
  return {
    listUrl: thumbnailUrl || (largeExpired ? null : largeUrl),
    previewUrl: largeExpired ? thumbnailUrl : (largeUrl || thumbnailUrl),
    largeExpired,
  }
}
