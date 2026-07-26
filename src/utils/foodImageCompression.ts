import Taro from '@tarojs/taro'
import {
  FOOD_IMAGE_LARGE_MAX_BYTES,
  FOOD_IMAGE_LARGE_MAX_EDGE,
  FOOD_IMAGE_THUMB_MAX_BYTES,
  FOOD_IMAGE_THUMB_MAX_EDGE,
  canReuseSourceAsLarge,
  nextCompressionQuality,
  scaleImageDimensions,
} from './foodImage'

export interface CompressedFoodImageVariant {
  path: string
  byteSize: number
  width: number
  height: number
  quality: number
}

export interface CompressedFoodImages {
  large: CompressedFoodImageVariant
  thumbnail: CompressedFoodImageVariant
}

function getFileSize(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().getFileInfo({
      filePath,
      success: info => resolve(info.size),
      fail: reject,
    })
  })
}

async function compressVariant(params: {
  sourcePath: string
  sourceWidth: number
  sourceHeight: number
  maxEdge: number
  maxBytes: number
  initialQuality: number
  minQuality: number
}): Promise<CompressedFoodImageVariant> {
  const dimensions = scaleImageDimensions(params.sourceWidth, params.sourceHeight, params.maxEdge)
  let quality = params.initialQuality
  let lastResult: CompressedFoodImageVariant | null = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await Taro.compressImage({
      src: params.sourcePath,
      quality,
      compressedWidth: dimensions.width,
      compressedHeight: dimensions.height,
    })
    const byteSize = await getFileSize(result.tempFilePath)
    lastResult = {...dimensions, path: result.tempFilePath, byteSize, quality}
    if (byteSize <= params.maxBytes) return lastResult

    const nextQuality = nextCompressionQuality(quality, byteSize, params.maxBytes, params.minQuality)
    if (nextQuality === quality) break
    quality = nextQuality
  }

  if (!lastResult || lastResult.byteSize > params.maxBytes) {
    throw new Error(`图片压缩后仍超过 ${(params.maxBytes / 1024).toFixed(0)}KB`)
  }
  return lastResult
}

export async function compressFoodImages(sourcePath: string): Promise<CompressedFoodImages> {
  const source = await Taro.getImageInfo({src: sourcePath})
  const sourceByteSize = await getFileSize(sourcePath)
  const largePromise = canReuseSourceAsLarge(source.width, source.height, sourceByteSize, source.type)
    ? Promise.resolve({
        path: sourcePath,
        byteSize: sourceByteSize,
        width: source.width,
        height: source.height,
        quality: 100,
      })
    : compressVariant({
        sourcePath,
        sourceWidth: source.width,
        sourceHeight: source.height,
        maxEdge: FOOD_IMAGE_LARGE_MAX_EDGE,
        maxBytes: FOOD_IMAGE_LARGE_MAX_BYTES,
        initialQuality: 76,
        minQuality: 45,
      })
  const [large, thumbnail] = await Promise.all([
    largePromise,
    compressVariant({
      sourcePath,
      sourceWidth: source.width,
      sourceHeight: source.height,
      maxEdge: FOOD_IMAGE_THUMB_MAX_EDGE,
      maxBytes: FOOD_IMAGE_THUMB_MAX_BYTES,
      initialQuality: 68,
      minQuality: 32,
    }),
  ])
  return {large, thumbnail}
}
