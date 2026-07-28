import {Canvas, Picker} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {getNutritionStatsByRange} from '@/db/api'
import type {NutritionStats} from '@/db/types'
import {NUTRITION_RECORDS_UPDATED} from '@/utils/nutrition'
import {getChartCanvasContext} from '@/utils/chartCanvas'
import {
  addDaysToDateKey,
  differenceInCalendarDays,
  getDaysInMonth,
  getShanghaiDateKey,
  getYearDateRange,
} from '@/utils/nutritionDates'

type HistoryMode = 'year' | 'custom'

interface HistoryPoint {
  label: string
  value: number
  included: boolean
}

function formatDateLabel(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}月${day}日`
}

function nextMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

function buildMonthPoints(stats: NutritionStats[], startDate: string, endDate: string, annual = false): HistoryPoint[] {
  const totals = stats.reduce<Record<string, number>>((acc, item) => {
    const monthKey = item.date.slice(0, 7)
    acc[monthKey] = (acc[monthKey] || 0) + item.total_calories
    return acc
  }, {})

  const points: HistoryPoint[] = []
  let monthKey = annual ? `${startDate.slice(0, 4)}-01` : startDate.slice(0, 7)
  const lastMonthKey = annual ? `${startDate.slice(0, 4)}-12` : endDate.slice(0, 7)

  while (monthKey <= lastMonthKey) {
    const [year, month] = monthKey.split('-').map(Number)
    const monthStart = `${monthKey}-01`
    const monthEnd = `${monthKey}-${String(getDaysInMonth(year, month)).padStart(2, '0')}`
    const visibleStart = monthStart < startDate ? startDate : monthStart
    const visibleEnd = monthEnd > endDate ? endDate : monthEnd
    const included = visibleStart <= visibleEnd
    const calendarDays = included ? differenceInCalendarDays(visibleStart, visibleEnd) + 1 : 0

    points.push({
      label: annual ? String(month) : `${month}月`,
      value: calendarDays > 0 ? (totals[monthKey] || 0) / calendarDays : 0,
      included,
    })
    monthKey = nextMonthKey(monthKey)
  }

  return points
}

function buildDailyPoints(stats: NutritionStats[], startDate: string, endDate: string): HistoryPoint[] {
  const totals = new Map(stats.map(item => [item.date, item.total_calories]))
  const points: HistoryPoint[] = []
  const totalDays = differenceInCalendarDays(startDate, endDate) + 1

  for (let index = 0; index < totalDays; index += 1) {
    const dateKey = addDaysToDateKey(startDate, index)
    const [, month, day] = dateKey.split('-').map(Number)
    points.push({
      label: `${month}/${day}`,
      value: totals.get(dateKey) || 0,
      included: true,
    })
  }
  return points
}

function HistoryTrendChart({data, calorieGoal}: {data: HistoryPoint[]; calorieGoal: number}) {
  const canvasId = 'calorie-history-trend'

  useEffect(() => {
    if (data.length === 0) return
    const timer = setTimeout(() => {
      const ctx = getChartCanvasContext(canvasId)
      if (!ctx) return
      const system = Taro.getSystemInfoSync()
      const width = Math.max(system.windowWidth - 64, 280)
      const height = 220
      const padding = {top: 20, right: 12, bottom: 42, left: 42}
      const innerWidth = width - padding.left - padding.right
      const innerHeight = height - padding.top - padding.bottom
      const included = data.map((point, index) => ({...point, index})).filter(point => point.included)
      const maxValue = Math.max(calorieGoal, ...included.map(point => point.value), 500)
      const niceMax = Math.ceil(maxValue / 500) * 500
      const toX = (index: number) => padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth
      const toY = (value: number) => padding.top + innerHeight - (value / niceMax) * innerHeight

      ctx.clearRect(0, 0, width, height)
      ;[0, 0.5, 1].forEach(ratio => {
        const y = padding.top + innerHeight - ratio * innerHeight
        ctx.beginPath()
        ctx.setStrokeStyle('#E5E7EB')
        ctx.setLineWidth(1)
        ctx.setLineDash(ratio === 0 ? [] : [3, 4], 0)
        ctx.moveTo(padding.left, y)
        ctx.lineTo(width - padding.right, y)
        ctx.stroke()
        ctx.setFillStyle('#9CA3AF')
        ctx.setFontSize(9)
        ctx.setTextAlign('right')
        ctx.fillText(String(Math.round(niceMax * ratio)), padding.left - 6, y + 3)
      })

      if (calorieGoal <= niceMax) {
        const goalY = toY(calorieGoal)
        ctx.beginPath()
        ctx.setStrokeStyle('#D97706')
        ctx.setLineWidth(1)
        ctx.setLineDash([5, 4], 0)
        ctx.moveTo(padding.left, goalY)
        ctx.lineTo(width - padding.right, goalY)
        ctx.stroke()
      }

      if (included.length > 0) {
        ctx.beginPath()
        included.forEach((point, index) => {
          const x = toX(point.index)
          const y = toY(point.value)
          if (index === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        const last = included[included.length - 1]
        const first = included[0]
        ctx.lineTo(toX(last.index), toY(0))
        ctx.lineTo(toX(first.index), toY(0))
        ctx.closePath()
        ctx.setFillStyle('#E9F4EC')
        ctx.fill()

        ctx.beginPath()
        included.forEach((point, index) => {
          const x = toX(point.index)
          const y = toY(point.value)
          if (index === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.setStrokeStyle('#2D6A3F')
        ctx.setLineWidth(2.5)
        ctx.setLineJoin('round')
        ctx.setLineCap('round')
        ctx.stroke()

        included.forEach(point => {
          ctx.beginPath()
          ctx.setFillStyle('#2D6A3F')
          ctx.arc(toX(point.index), toY(point.value), 3, 0, Math.PI * 2)
          ctx.fill()
        })
      }

      const labelStep = data.length <= 13 ? 1 : Math.ceil((data.length - 1) / 4)
      data.forEach((point, index) => {
        if (index % labelStep !== 0 && index !== data.length - 1) return
        ctx.setFillStyle(point.included ? '#6B7280' : '#D1D5DB')
        ctx.setFontSize(9)
        ctx.setTextAlign('center')
        ctx.fillText(point.label, toX(index), height - 16)
      })
      ctx.draw()
    }, 120)

    return () => clearTimeout(timer)
  }, [calorieGoal, data])

  return <Canvas canvasId={canvasId} style={{width: '100%', height: '220px', display: 'block'}} />
}

function getGoalStatus(calories: number, goal: number) {
  const ratio = goal > 0 ? calories / goal : 0
  if (ratio > 1.1) return {label: '超出目标', color: '#DC2626', background: '#FEE2E2'}
  if (ratio >= 0.9) return {label: '已达标', color: '#2D6A3F', background: '#E9F4EC'}
  return {label: '低于目标', color: '#B45309', background: '#FEF3C7'}
}

export function CalorieHistoryPanel({
  userId,
  memberId,
  calorieGoal,
}: {
  userId: string
  memberId: string | null
  calorieGoal: number
}) {
  const today = useMemo(() => getShanghaiDateKey(), [])
  const currentYear = Number(today.slice(0, 4))
  const [mode, setMode] = useState<HistoryMode>('year')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [customStart, setCustomStart] = useState(addDaysToDateKey(today, -29))
  const [customEnd, setCustomEnd] = useState(today)
  const [stats, setStats] = useState<NutritionStats[]>([])
  const [loading, setLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(10)
  const requestSequence = useRef(0)

  const activeRange = useMemo(() => (
    mode === 'year' ? getYearDateRange(selectedYear, today) : {startDate: customStart, endDate: customEnd}
  ), [customEnd, customStart, mode, selectedYear, today])

  const loadHistory = useCallback(async () => {
    const requestId = requestSequence.current + 1
    requestSequence.current = requestId
    setLoading(true)
    try {
      const data = await getNutritionStatsByRange(
        userId,
        memberId,
        activeRange.startDate,
        activeRange.endDate,
      )
      if (requestId === requestSequence.current) setStats(data)
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }, [activeRange.endDate, activeRange.startDate, memberId, userId])

  useEffect(() => { void loadHistory() }, [loadHistory])
  useEffect(() => { setVisibleCount(10) }, [activeRange.endDate, activeRange.startDate])
  useEffect(() => {
    const handleRecordsUpdated = () => { void loadHistory() }
    Taro.eventCenter.on(NUTRITION_RECORDS_UPDATED, handleRecordsUpdated)
    return () => {
      Taro.eventCenter.off(NUTRITION_RECORDS_UPDATED, handleRecordsUpdated)
    }
  }, [loadHistory])

  const totalDays = differenceInCalendarDays(activeRange.startDate, activeRange.endDate) + 1
  const summary = useMemo(() => {
    const totalCalories = stats.reduce((sum, item) => sum + item.total_calories, 0)
    const maxCalories = stats.reduce((max, item) => Math.max(max, item.total_calories), 0)
    const goalDays = stats.filter(item => {
      const ratio = item.total_calories / calorieGoal
      return ratio >= 0.9 && ratio <= 1.1
    }).length
    return {
      average: totalDays > 0 ? totalCalories / totalDays : 0,
      maxCalories,
      goalDays,
    }
  }, [calorieGoal, stats, totalDays])

  const chartData = useMemo(() => {
    if (mode === 'year') return buildMonthPoints(stats, activeRange.startDate, activeRange.endDate, true)
    if (totalDays <= 31) return buildDailyPoints(stats, activeRange.startDate, activeRange.endDate)
    return buildMonthPoints(stats, activeRange.startDate, activeRange.endDate)
  }, [activeRange.endDate, activeRange.startDate, mode, stats, totalDays])

  const historyRows = useMemo(() => [...stats].sort((a, b) => b.date.localeCompare(a.date)), [stats])
  const trendTitle = mode === 'year' ? '12个月月均摄入' : totalDays <= 31 ? '每日摄入趋势' : '月均摄入趋势'

  const updateCustomRange = (nextStart: string, nextEnd: string) => {
    if (differenceInCalendarDays(nextStart, nextEnd) > 365) {
      Taro.showToast({title: '自定义范围最多366天', icon: 'none'})
      return
    }
    setCustomStart(nextStart)
    setCustomEnd(nextEnd)
  }

  return (
    <div className="bg-card rounded-2xl p-4 shadow-elegant">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="i-mdi-calendar-search text-2xl text-primary" />
          <span className="text-xl font-semibold text-foreground">历史热量查询</span>
        </div>
        <span className="text-xl text-muted-foreground">按自然日统计</span>
      </div>

      <div className="flex bg-secondary rounded-xl p-1 mb-4">
        {([
          {value: 'year' as const, label: '全年12个月'},
          {value: 'custom' as const, label: '自定义范围'},
        ]).map(item => (
          <button
            key={item.value}
            type="button"
            className={`flex-1 flex items-center justify-center text-xl font-medium rounded-lg ${mode === item.value ? 'bg-white text-primary shadow-elegant' : 'text-muted-foreground'}`}
            style={{height: '40px'}}
            onClick={() => setMode(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === 'year' ? (
        <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
          <button
            type="button"
            className="flex items-center justify-center text-primary disabled:text-muted-foreground"
            style={{width: '40px', height: '40px'}}
            disabled={selectedYear <= 2000}
            onClick={() => setSelectedYear(year => year - 1)}
          >
            <div className="i-mdi-chevron-left text-2xl" />
          </button>
          <div className="text-center">
            <p className="text-2xl font-semibold text-foreground">{selectedYear}年</p>
            <p className="text-xl text-muted-foreground">1月至12月</p>
          </div>
          <button
            type="button"
            className="flex items-center justify-center text-primary disabled:text-muted-foreground"
            style={{width: '40px', height: '40px'}}
            disabled={selectedYear >= currentYear}
            onClick={() => setSelectedYear(year => year + 1)}
          >
            <div className="i-mdi-chevron-right text-2xl" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 border-b border-border pb-3 mb-3">
          <Picker
            mode="date"
            value={customStart}
            end={customEnd}
            onChange={event => updateCustomRange(String(event.detail.value), customEnd)}
          >
            <button type="button" className="w-full text-left bg-secondary rounded-xl px-3 py-2">
              <span className="block text-xl text-muted-foreground">开始日期</span>
              <span className="block text-xl font-semibold text-foreground mt-1">{customStart}</span>
            </button>
          </Picker>
          <Picker
            mode="date"
            value={customEnd}
            start={customStart}
            end={today}
            onChange={event => updateCustomRange(customStart, String(event.detail.value))}
          >
            <button type="button" className="w-full text-left bg-secondary rounded-xl px-3 py-2">
              <span className="block text-xl text-muted-foreground">结束日期</span>
              <span className="block text-xl font-semibold text-foreground mt-1">{customEnd}</span>
            </button>
          </Picker>
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-xl font-semibold text-foreground">{trendTitle}</p>
          <p className="text-xl text-muted-foreground mt-1">{activeRange.startDate} 至 {activeRange.endDate}</p>
        </div>
        <span className="text-xl font-medium text-primary">kcal</span>
      </div>

      {loading ? (
        <div className="h-56 bg-secondary rounded-xl animate-breathe" />
      ) : (
        <HistoryTrendChart data={chartData} calorieGoal={calorieGoal} />
      )}

      <div className="grid grid-cols-3 border-y border-border py-3">
        {[
          {label: '平均摄入', value: summary.average.toFixed(0), suffix: 'kcal'},
          {label: '最高记录', value: summary.maxCalories.toFixed(0), suffix: 'kcal'},
          {label: '达标天数', value: `${summary.goalDays}/${totalDays}`, suffix: '天'},
        ].map((item, index) => (
          <div key={item.label} className={`text-center px-1 ${index > 0 ? 'border-l border-border' : ''}`}>
            <p className="text-xl text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{item.value}</p>
            <p className="text-xl text-muted-foreground">{item.suffix}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 mb-2">
        <span className="text-xl font-semibold text-foreground">历史记录</span>
        <span className="text-xl text-muted-foreground">{historyRows.length} 个记录日</span>
      </div>

      {historyRows.length === 0 && !loading ? (
        <div className="flex flex-col items-center py-8">
          <div className="i-mdi-calendar-blank-outline text-4xl text-muted-foreground" />
          <p className="text-xl text-muted-foreground mt-2">该时间范围暂无热量记录</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {historyRows.slice(0, visibleCount).map(item => {
            const status = getGoalStatus(item.total_calories, calorieGoal)
            return (
              <div key={item.date} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{width: '40px', height: '40px', borderRadius: '50%', backgroundColor: status.background}}
                >
                  <div className="i-mdi-silverware-fork-knife text-2xl" style={{color: status.color}} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-medium text-foreground">{formatDateLabel(item.date)}</p>
                  <p className="text-xl text-muted-foreground mt-1">目标 {calorieGoal} kcal · {item.records_count} 次记录</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-foreground">{item.total_calories.toFixed(0)} <span className="text-xl font-normal text-muted-foreground">kcal</span></p>
                  <p className="text-xl font-medium mt-1" style={{color: status.color}}>{status.label}</p>
                </div>
              </div>
            )
          })}
          {visibleCount < historyRows.length && (
            <button
              type="button"
              className="flex items-center justify-center gap-1 text-xl font-medium text-primary mt-2"
              style={{height: '44px'}}
              onClick={() => setVisibleCount(count => count + 10)}
            >
              <span>查看更多</span>
              <div className="i-mdi-chevron-down text-2xl" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
