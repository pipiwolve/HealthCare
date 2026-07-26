import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'

const source = readFileSync(resolve('src/utils/macronutrients.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`)
  }
}

const balanced = helpers.calculateMacroDistribution({carbs: 10, protein: 10, fat: 10})
assertEqual(balanced.totalCalories, 170, 'macro calories use 4/4/9 kcal per gram')
assertEqual(
  balanced.items.map(item => item.percentage),
  [24, 23, 53],
  'rounded energy percentages are distributed to exactly 100 percent',
)
assertEqual(
  balanced.items.reduce((sum, item) => sum + item.percentage, 0),
  100,
  'display percentages sum to 100',
)

const empty = helpers.calculateMacroDistribution({carbs: Number.NaN, protein: -1, fat: 0})
assertEqual(empty.totalCalories, 0, 'invalid and negative values are treated as zero')
assertEqual(empty.items.map(item => item.percentage), [0, 0, 0], 'empty data has zero percentages')

console.log('macro distribution checks passed')
