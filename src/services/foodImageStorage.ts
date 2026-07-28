import {supabase} from '@/client/supabase'
import {isRemoteImageUrl} from '@/utils/foodImage'
import type {CompressedFoodImageVariant} from '@/utils/foodImageCompression'

export interface StoredFoodImage {
  image_id: string
  image_url: string
  thumbnail_url: string
  image_expires_at: string
}

export async function uploadFoodImageVariants(params: {
  largeImage: string
  thumbnailImage: string
  large: CompressedFoodImageVariant
  thumbnail: CompressedFoodImageVariant
}): Promise<StoredFoodImage> {
  const {data, error} = await supabase.functions.invoke<{
    imageId?: string
    largeUrl?: string
    thumbnailUrl?: string
    largeExpiresAt?: string
    message?: string
  }>('upload-food-image', {
    body: {
      action: 'upload',
      largeImage: params.largeImage,
      thumbnailImage: params.thumbnailImage,
      largeMeta: {width: params.large.width, height: params.large.height},
      thumbnailMeta: {width: params.thumbnail.width, height: params.thumbnail.height},
    },
  })
  if (error) throw new Error(error.message || '食材图片上传失败')
  if (!data?.imageId || !isRemoteImageUrl(data.largeUrl) || !isRemoteImageUrl(data.thumbnailUrl) || !data.largeExpiresAt) {
    throw new Error(data?.message || '食材图片上传响应无效')
  }
  return {
    image_id: data.imageId,
    image_url: data.largeUrl,
    thumbnail_url: data.thumbnailUrl,
    image_expires_at: data.largeExpiresAt,
  }
}
