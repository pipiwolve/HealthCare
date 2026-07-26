export type MacroValues = {
  carbs: number
  protein: number
  fat: number
}

export type MacroDistributionItem = {
  key: keyof MacroValues
  label: string
  grams: number
  calories: number
  ratio: number
  percentage: number
  color: string
}

const MACRO_CONFIG: Array<{
  key: keyof MacroValues
  label: string
  caloriesPerGram: number
  color: string
}> = [
  {key: 'carbs', label: '碳水化合物', caloriesPerGram: 4, color: '#3F8D5B'},
  {key: 'protein', label: '蛋白质', caloriesPerGram: 4, color: '#F59A23'},
  {key: 'fat', label: '脂肪', caloriesPerGram: 9, color: '#EA4335'},
]

function sanitize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function calculateMacroDistribution(values: MacroValues) {
  const base = MACRO_CONFIG.map(item => {
    const grams = sanitize(values[item.key])
    return {...item, grams, calories: grams * item.caloriesPerGram}
  })
  const totalCalories = base.reduce((sum, item) => sum + item.calories, 0)
  const totalGrams = base.reduce((sum, item) => sum + item.grams, 0)
  const rawPercentages = base.map(item => totalCalories > 0 ? item.calories / totalCalories * 100 : 0)
  const percentages = rawPercentages.map(value => Math.floor(value))

  let remaining = totalCalories > 0 ? 100 - percentages.reduce((sum, value) => sum + value, 0) : 0
  const remainderOrder = rawPercentages
    .map((value, index) => ({index, remainder: value - percentages[index]}))
    .sort((a, b) => b.remainder - a.remainder)
  for (const item of remainderOrder) {
    if (remaining <= 0) break
    percentages[item.index] += 1
    remaining -= 1
  }

  const items: MacroDistributionItem[] = base.map((item, index) => ({
    key: item.key,
    label: item.label,
    grams: item.grams,
    calories: item.calories,
    ratio: totalCalories > 0 ? item.calories / totalCalories : 0,
    percentage: percentages[index],
    color: item.color,
  }))

  return {items, totalCalories, totalGrams}
}
