import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const helperSource = readFileSync(resolve(root, 'src/utils/foodImage.ts'), 'utf8')
const compressionSource = readFileSync(resolve(root, 'src/utils/foodImageCompression.ts'), 'utf8')
const uploadSource = readFileSync(resolve(root, 'supabase/functions/upload-food-image/index.ts'), 'utf8')
const cleanupSource = readFileSync(resolve(root, 'supabase/functions/food-image-cleanup/index.ts'), 'utf8')
const migrationSource = readFileSync(resolve(root, 'supabase/migrations/00006_food_image_lifecycle.sql'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/pages/home/index.tsx'), 'utf8')
const js = ts.transpileModule(helperSource, {
  compilerOptions: {module: 99, target: 99},
}).outputText
const helpers = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(
  JSON.stringify(helpers.scaleImageDimensions(4000, 3000, 1280)) === JSON.stringify({width: 1280, height: 960}),
  'large image dimensions should preserve aspect ratio at 1280px'
)
assert(
  JSON.stringify(helpers.scaleImageDimensions(612, 612, 320)) === JSON.stringify({width: 320, height: 320}),
  'thumbnail dimensions should cap the long edge at 320px'
)
assert(helpers.nextCompressionQuality(68, 80 * 1024, 50 * 1024, 32) < 68, 'oversized images should lower quality')
assert(helpers.nextCompressionQuality(40, 100 * 1024, 50 * 1024, 32) >= 32, 'quality should never fall below the minimum')
assert(helpers.canReuseSourceAsLarge(612, 612, 35689, 'jpeg'), 'small JPEG files should be reused without re-encoding')
assert(!helpers.canReuseSourceAsLarge(2000, 1200, 35689, 'jpeg'), 'oversized dimensions should require compression')
assert(!helpers.canReuseSourceAsLarge(612, 612, 35689, 'png'), 'non-JPEG files should be converted before upload')
assert(helpers.isRemoteImageUrl('https://example.com/image.jpg'), 'HTTPS image URLs should be accepted')
assert(!helpers.isRemoteImageUrl('wxfile://tmp/image.jpg'), 'temporary miniapp paths must not be persisted')

const image = {
  image_url: 'https://example.com/large.jpg',
  thumbnail_url: 'https://example.com/thumb.jpg',
  image_expires_at: '2026-07-25T00:00:00.000Z',
}
assert(
  helpers.getFoodImageDisplay(image, Date.parse('2026-07-24T00:00:00.000Z')).previewUrl === image.image_url,
  'unexpired images should preview the large variant'
)
const expired = helpers.getFoodImageDisplay(image, Date.parse('2026-07-26T00:00:00.000Z'))
assert(expired.largeExpired && expired.previewUrl === image.thumbnail_url, 'expired large images should fall back to the thumbnail')

assert(
  compressionSource.includes('FOOD_IMAGE_LARGE_MAX_EDGE') &&
    compressionSource.includes('FOOD_IMAGE_THUMB_MAX_EDGE') &&
    compressionSource.includes('compressedWidth') &&
    compressionSource.includes('compressedHeight') &&
    compressionSource.includes('nextCompressionQuality'),
  'Taro compression should enforce dimensions and retry quality based on byte size'
)
assert(
  uploadSource.includes('getAuthUserId(req)') &&
    uploadSource.includes('LARGE_MAX_BYTES = 300 * 1024') &&
    uploadSource.includes('THUMBNAIL_MAX_BYTES = 50 * 1024') &&
    uploadSource.includes('`${userId}/${imageId}/large.jpg`') &&
    uploadSource.includes('`${userId}/${imageId}/thumb.jpg`'),
  'image upload should authenticate users, enforce size limits, and isolate storage paths by user'
)
assert(
  migrationSource.includes("interval '30 days'") &&
    migrationSource.includes("interval '24 hours'") &&
    migrationSource.includes('food_image_records') &&
    migrationSource.includes('weighing_records_link_food_images'),
  'image metadata should retain large images for 30 days and track thumbnails against weighing records'
)
assert(
  cleanupSource.includes("Deno.env.get('FOOD_IMAGE_CLEANUP_SECRET')") &&
    cleanupSource.includes("admin.storage.from(BUCKET).remove(paths)"),
  'cleanup dispatch should be secret-protected and remove expired storage objects'
)
assert(
  homeSource.includes('lazyLoad') &&
    homeSource.includes('Taro.previewImage') &&
    homeSource.includes('onError={() => setFailedHistoryImages') &&
    homeSource.includes('getFoodImageDisplay(ing)'),
  'weighing history should lazy-load thumbnails, support native preview, and handle image errors'
)

console.log('food image compression checks passed')
