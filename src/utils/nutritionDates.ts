export type NutritionPeriod = 'day' | 'week' | 'month'

const DAY_MS = 24 * 60 * 60 * 1000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function getShanghaiDateKey(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  return formatUtcDate(new Date(date.getTime() + SHANGHAI_OFFSET_MS))
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return formatUtcDate(date)
}

export function differenceInCalendarDays(startDate: string, endDate: string): number {
  return Math.round((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / DAY_MS)
}

export function getNutritionPeriodRange(period: NutritionPeriod, now: Date = new Date()) {
  const endDate = getShanghaiDateKey(now)
  let startDate = endDate

  if (period === 'week') {
    const weekday = parseDateKey(endDate).getUTCDay()
    const daysSinceMonday = (weekday + 6) % 7
    startDate = addDaysToDateKey(endDate, -daysSinceMonday)
  } else if (period === 'month') {
    startDate = `${endDate.slice(0, 7)}-01`
  }

  return {
    startDate,
    endDate,
    elapsedDays: differenceInCalendarDays(startDate, endDate) + 1,
  }
}

export function getYearDateRange(year: number, today = getShanghaiDateKey()) {
  const currentYear = Number(today.slice(0, 4))
  return {
    startDate: `${year}-01-01`,
    endDate: year === currentYear ? today : `${year}-12-31`,
  }
}

export function toShanghaiRangeIso(startDate: string, endDate: string) {
  return {
    startIso: new Date(`${startDate}T00:00:00+08:00`).toISOString(),
    endExclusiveIso: new Date(`${addDaysToDateKey(endDate, 1)}T00:00:00+08:00`).toISOString(),
  }
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
