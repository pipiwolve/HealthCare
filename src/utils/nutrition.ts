import {normalizeAiMarkdown} from './markdownText'

export const NUTRITION_RECORDS_UPDATED = 'nutrition-records-updated'

export type NutritionValues = {
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
}

const emptyNutrition: NutritionValues = {
  calories: null,
  protein: null,
  fat: null,
  carbs: null,
}

export function extractNutritionValues(text: string): NutritionValues {
  const normalized = normalizeAiMarkdown(text)
  const fromJson = parseNutritionJson(normalized)
  const fromText = parseNutritionText(normalized)

  return {
    calories: firstFinite(fromJson.calories, fromText.calories),
    protein: firstFinite(fromJson.protein, fromText.protein),
    fat: firstFinite(fromJson.fat, fromText.fat),
    carbs: firstFinite(fromJson.carbs, fromText.carbs),
  }
}

function parseNutritionJson(text: string): NutritionValues {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1]
  const candidates = [fenced, findFirstJsonObject(text)].filter(Boolean) as string[]

  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate)
      return {
        calories: toNumber(data.calories ?? data.total_calories ?? data.kcal ?? data['热量'] ?? data['总热量'] ?? null),
        protein: toNumber(data.protein ?? data['蛋白质'] ?? data['蛋白'] ?? null),
        fat: toNumber(data.fat ?? data['脂肪'] ?? null),
        carbs: toNumber(data.carbs ?? data.carbohydrate ?? data.carbohydrates ?? data['碳水'] ?? data['碳水化合物'] ?? null),
      }
    } catch {}
  }

  return emptyNutrition
}

function parseNutritionText(text: string): NutritionValues {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  return {
    calories: findLineValue(lines, ['热量', '总热量', '能量', '卡路里', 'calories'], ['kcal', '千卡', '大卡', 'cal']),
    protein: findLineValue(lines, ['蛋白质', '蛋白', 'protein'], ['g', '克']),
    fat: findLineValue(lines, ['脂肪', '脂坊', 'fat'], ['g', '克']),
    carbs: findLineValue(lines, ['碳水化合物', '碳水', 'carbs', 'carbohydrate'], ['g', '克']),
  }
}

function findLineValue(lines: string[], labels: string[], units: string[]): number | null {
  for (const line of lines) {
    const matchedLabel = labels.find(label => line.toLowerCase().includes(label.toLowerCase()))
    if (!matchedLabel) continue
    const normalizedLine = line.replace(/\|/g, ' ').replace(/[：:]/g, ' ')
    const labelIndex = normalizedLine.toLowerCase().indexOf(matchedLabel.toLowerCase())
    const searchable = normalizedLine.slice(labelIndex + matchedLabel.length)
    const withUnit = new RegExp(`(?:约\\s*)?([0-9]+(?:\\.[0-9]+)?)\\s*(?:${units.join('|')})`, 'i').exec(searchable)
    if (withUnit) return toNumber(withUnit[1])
    const firstNumber = /(?:约\s*)?([0-9]+(?:\.[0-9]+)?)/.exec(searchable)
    if (firstNumber) return toNumber(firstNumber[1])
  }
  return null
}

function findFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

function firstFinite(...values: Array<number | null | undefined>): number | null {
  return values.find(value => typeof value === 'number' && Number.isFinite(value)) ?? null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.match(/[0-9]+(?:\.[0-9]+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}
