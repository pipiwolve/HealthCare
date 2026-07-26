import {corsHeaders, getSupabaseAdmin, handleError, HttpError, json} from '../_shared/common.ts'

const BUCKET = 'chat-images'

type CleanupCandidate = {
  id: string
  large_path: string
  thumbnail_path: string
  delete_all: boolean
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
  if (req.method !== 'POST') return json({message: 'Method Not Allowed'}, 405)
  try {
    const expectedSecret = Deno.env.get('FOOD_IMAGE_CLEANUP_SECRET') || ''
    const suppliedSecret = req.headers.get('x-dispatch-secret') || ''
    if (!expectedSecret || suppliedSecret !== expectedSecret) throw new HttpError(401, 'Unauthorized')

    const parsedBody = await req.json().catch(() => ({}))
    const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? parsedBody as Record<string, unknown>
      : {}
    const requestedBatch = Number(body.batchSize)
    const batchSize = Number.isFinite(requestedBatch) ? Math.max(1, Math.min(500, Math.floor(requestedBatch))) : 100
    const admin = getSupabaseAdmin()
    const {data, error} = await admin.rpc('get_food_images_for_cleanup', {batch_size: batchSize})
    if (error) throw error

    let largeDeleted = 0
    let orphanDeleted = 0
    const failures: string[] = []
    for (const candidate of (data || []) as CleanupCandidate[]) {
      const paths = candidate.delete_all
        ? [candidate.large_path, candidate.thumbnail_path]
        : [candidate.large_path]
      const {error: storageError} = await admin.storage.from(BUCKET).remove(paths)
      if (storageError) {
        failures.push(candidate.id)
        continue
      }

      if (candidate.delete_all) {
        const {error: deleteError} = await admin.from('food_images').delete().eq('id', candidate.id)
        if (deleteError) failures.push(candidate.id)
        else orphanDeleted += 1
      } else {
        const {error: updateError} = await admin.from('food_images')
          .update({large_deleted_at: new Date().toISOString()})
          .eq('id', candidate.id)
          .is('large_deleted_at', null)
        if (updateError) failures.push(candidate.id)
        else largeDeleted += 1
      }
    }

    return json({scanned: (data || []).length, largeDeleted, orphanDeleted, failures})
  } catch (error) {
    return handleError(error, 'food-image-cleanup')
  }
})
