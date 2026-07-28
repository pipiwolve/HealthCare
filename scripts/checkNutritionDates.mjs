import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'

const source = readFileSync(resolve('src/utils/nutritionDates.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText
const helpers = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`)
  }
}

assertEqual(
  helpers.getShanghaiDateKey('2026-07-20T15:59:59.000Z'),
  '2026-07-20',
  'timestamps before Shanghai midnight remain on the previous date',
)
assertEqual(
  helpers.getShanghaiDateKey('2026-07-20T16:00:00.000Z'),
  '2026-07-21',
  'timestamps at Shanghai midnight move to the next date',
)
assertEqual(
  helpers.getNutritionPeriodRange('week', new Date('2026-07-21T04:00:00.000Z')),
  {startDate: '2026-07-20', endDate: '2026-07-21', elapsedDays: 2},
  'weekly periods start on Monday and average over elapsed natural days',
)
assertEqual(
  helpers.getNutritionPeriodRange('month', new Date('2026-07-21T04:00:00.000Z')),
  {startDate: '2026-07-01', endDate: '2026-07-21', elapsedDays: 21},
  'monthly periods average over elapsed natural days',
)
assertEqual(
  helpers.toShanghaiRangeIso('2026-07-21', '2026-07-22'),
  {startIso: '2026-07-20T16:00:00.000Z', endExclusiveIso: '2026-07-22T16:00:00.000Z'},
  'database ranges include the full Shanghai end date',
)
assertEqual(helpers.getDaysInMonth(2024, 2), 29, 'leap-year February contains 29 days')

console.log('nutrition date checks passed')
