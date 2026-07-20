import Taro from '@tarojs/taro'
import recipePosterBackground from '@/assets/recipe/recipe-poster-background.jpg'
import type {Ingredient} from '@/db/types'
import {extractPosterSections} from '@/utils/recipeShareContent'

export type PosterVariant = 'card' | 'timeline' | 'poster'
export interface RecipePosterAssets {card: string; timeline: string; poster: string}
interface PosterData {title: string; recipeContent: string; ingredients: Ingredient[]; backgroundImage?: string}

const SIZES: Record<PosterVariant, {width: number; height: number}> = {
  card: {width: 1000, height: 800},
  timeline: {width: 1000, height: 1000},
  poster: {width: 1080, height: 1440}
}

const BACKGROUND_SIZE = {width: 1080, height: 1440}

function drawBackgroundCover(ctx: Taro.CanvasContext, imagePath: string, width: number, height: number) {
  const sourceRatio = BACKGROUND_SIZE.width / BACKGROUND_SIZE.height
  const targetRatio = width / height
  if (targetRatio > sourceRatio) {
    const sourceHeight = BACKGROUND_SIZE.width / targetRatio
    const sourceY = (BACKGROUND_SIZE.height - sourceHeight) / 2
    ctx.drawImage(imagePath, 0, sourceY, BACKGROUND_SIZE.width, sourceHeight, 0, 0, width, height)
  } else {
    const sourceWidth = BACKGROUND_SIZE.height * targetRatio
    const sourceX = (BACKGROUND_SIZE.width - sourceWidth) / 2
    ctx.drawImage(imagePath, sourceX, 0, sourceWidth, BACKGROUND_SIZE.height, 0, 0, width, height)
  }
}

function wrapText(ctx: Taro.CanvasContext, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const char of text) {
    const next = current + char
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = char
      if (lines.length === maxLines) break
    } else {
      current = next
    }
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (lines.length === maxLines && lines.join('').length < text.length) lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`
  return lines
}

function drawRoundedRect(ctx: Taro.CanvasContext, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.arc(x + width - radius, y + radius, radius, -Math.PI / 2, 0)
  ctx.lineTo(x + width, y + height - radius)
  ctx.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2)
  ctx.lineTo(x + radius, y + height)
  ctx.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + radius)
  ctx.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5)
  ctx.closePath()
}

function exportCanvas(canvasId: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.canvasToTempFilePath({
      canvasId, x: 0, y: 0, width, height, destWidth: width, destHeight: height,
      fileType: 'jpg', quality: 0.92,
      success: result => resolve(result.tempFilePath),
      fail: reject
    })
  })
}

export async function renderRecipePoster(canvasId: string, variant: PosterVariant, data: PosterData): Promise<string> {
  const {width, height} = SIZES[variant]
  const ctx = Taro.createCanvasContext(canvasId)
  const sections = extractPosterSections(data.recipeContent)
  const panelMargin = variant === 'poster' ? 32 : 36
  const panelPadding = variant === 'poster' ? 38 : 32
  const contentWidth = width - panelMargin * 2

  ctx.setFillStyle('#FFFFFF')
  ctx.fillRect(0, 0, width, height)
  drawBackgroundCover(ctx, data.backgroundImage || recipePosterBackground, width, height)
  ctx.setFillStyle('#204E3A')
  ctx.fillRect(0, 0, width, variant === 'poster' ? 232 : 210)
  ctx.setFillStyle('#E05A47')
  ctx.fillRect(panelMargin, variant === 'poster' ? 214 : 190, 132, 10)
  ctx.setFillStyle('#FFFFFF')
  ctx.setFontSize(variant === 'poster' ? 62 : 50)
  ctx.setTextAlign('left')
  wrapText(ctx, data.title || 'AI 推荐菜谱', contentWidth, 2).forEach((line, index) => {
    ctx.fillText(line, panelMargin, (variant === 'poster' ? 82 : 72) + index * (variant === 'poster' ? 66 : 54))
  })
  ctx.setFontSize(26)
  ctx.setFillStyle('#DCE9E2')
  ctx.fillText('智能健康助手 · 营养菜谱', panelMargin, variant === 'poster' ? 200 : 174)

  const panelTop = variant === 'poster' ? 252 : 230
  drawRoundedRect(ctx, panelMargin, panelTop, contentWidth, height - panelTop - panelMargin, 22)
  ctx.setFillStyle('#FFFFFF')
  ctx.fill()

  const textX = panelMargin + panelPadding
  const textWidth = contentWidth - panelPadding * 2
  const lineHeight = variant === 'poster' ? 43 : 37
  const bodyBottom = height - panelMargin - 104
  let y = panelTop + 54
  const drawSection = (
    label: string,
    items: string[],
    maxItems: number,
    maxLinesPerItem: number,
    sectionBottom: number
  ) => {
    if (!items.length || y + 72 > sectionBottom) return
    ctx.setFillStyle('#204E3A')
    ctx.setFontSize(variant === 'poster' ? 34 : 31)
    ctx.fillText(label, textX, y)
    y += variant === 'poster' ? 48 : 43
    ctx.setFillStyle('#303734')
    ctx.setFontSize(variant === 'poster' ? 29 : 25)
    for (const item of items.slice(0, maxItems)) {
      const availableLines = Math.floor((sectionBottom - y) / lineHeight)
      if (availableLines <= 0) break
      const lines = wrapText(ctx, `• ${item}`, textWidth, Math.min(maxLinesPerItem, availableLines))
      for (const line of lines) {
        ctx.fillText(line, textX, y)
        y += lineHeight
      }
      y += variant === 'poster' ? 7 : 5
    }
    y = Math.min(y + (variant === 'poster' ? 22 : 18), sectionBottom)
  }

  const ingredientLines = data.ingredients.length
    ? data.ingredients.map(item => `${item.name} ${item.weight}${item.unit}`)
    : sections.ingredients
  const ingredientBottom = panelTop + (variant === 'poster' ? 330 : variant === 'timeline' ? 270 : 225)
  const stepsBottom = variant === 'poster' ? panelTop + 825 : bodyBottom
  drawSection(
    '主要食材',
    ingredientLines,
    variant === 'poster' ? 8 : variant === 'timeline' ? 6 : 4,
    2,
    ingredientBottom
  )
  drawSection(
    '烹饪步骤',
    sections.steps,
    variant === 'poster' ? 6 : variant === 'timeline' ? 4 : 3,
    variant === 'poster' ? 3 : 2,
    stepsBottom
  )
  if (variant === 'poster') drawSection('营养亮点', sections.nutrition, 3, 3, bodyBottom)

  ctx.setFillStyle('#6D756F')
  ctx.setFontSize(24)
  ctx.fillText('打开小程序查看完整做法', textX, height - panelMargin - 38)
  ctx.setFillStyle('#E05A47')
  ctx.fillRect(width - panelMargin - panelPadding - 54, height - panelMargin - 64, 54, 54)

  await new Promise<void>(resolve => ctx.draw(false, resolve))
  return exportCanvas(canvasId, width, height)
}

export async function generateRecipePosterAssets(canvasId: string, data: PosterData): Promise<RecipePosterAssets> {
  return {
    card: await renderRecipePoster(canvasId, 'card', data),
    timeline: await renderRecipePoster(canvasId, 'timeline', data),
    poster: await renderRecipePoster(canvasId, 'poster', data)
  }
}
