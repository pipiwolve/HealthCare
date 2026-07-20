// @title 饮食统计

import {Canvas, Image} from '@tarojs/components'
import Taro, {useDidShow} from '@tarojs/taro'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {withRouteGuard} from '@/components/RouteGuard'
import {useAuth} from '@/contexts/AuthContext'
import {getNutritionStats} from '@/db/api'
import type {NutritionStats} from '@/db/types'
import {useAppStore} from '@/store/appStore'
import {NUTRITION_RECORDS_UPDATED} from '@/utils/nutrition'
import {getMemberAvatar} from '@/utils/avatarUtils'

type Period = 'day' | 'week' | 'month'

interface ChartPoint { label: string; value: number; hasData: boolean }

// 折线图组件 — 使用微信小程序 Canvas 绘制（SVG 在微信小程序中不支持）
function TrendLineChart({data, mode, xSubTitle}: {
  data: ChartPoint[]
  mode: 'week' | 'month'
  xSubTitle: string
}) {
  const canvasId = useMemo(() => `trend-${mode}`, [mode])

  useEffect(() => {
    if (!data.length) return
    const timer = setTimeout(() => {
      const ctx = Taro.createCanvasContext(canvasId)
      const sys = Taro.getSystemInfoSync()
      // 算出 canvas 实际可用宽度：屏幕宽 - 页面 px-4(32) - 卡片 p-4(32)
      const cssW = Math.max(sys.windowWidth - 64, 280)
      const cssH = 200

      const W = cssW
      const H = cssH
      const PAD = {top: 28, right: 16, bottom: 44, left: 50}
      const innerW = W - PAD.left - PAD.right
      const innerH = H - PAD.top - PAD.bottom

      const lineColor = mode === 'week' ? '#60B3E8' : '#F5A524'
      const fillColor = mode === 'week' ? '#EFF7FE' : '#FEF3E2'

      const maxVal = Math.max(...data.map(d => d.value), 100)
      const niceMax = Math.ceil(maxVal / 500) * 500 || 500

      const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * innerW
      const toY = (v: number) => PAD.top + innerH - (v / niceMax) * innerH

      ctx.clearRect(0, 0, W, H)

      // ---- Y轴网格线 + 刻度 ----
      const yTicks = [0, 1 / 3, 2 / 3, 1]
      yTicks.forEach((t, i) => {
        const y = PAD.top + innerH - t * innerH
        const val = Math.round(t * niceMax)

        ctx.beginPath()
        ctx.setStrokeStyle(i === 0 ? '#D1D5DB' : '#E9ECF0')
        ctx.setLineWidth(1)
        ctx.setLineDash(i === 0 ? [] : [4, 3], 0)
        ctx.moveTo(PAD.left, y)
        ctx.lineTo(W - PAD.right, y)
        ctx.stroke()

        ctx.setFontSize(10)
        ctx.setFillStyle('#9CA3AF')
        ctx.setTextAlign('right')
        ctx.fillText(String(val), PAD.left - 6, y + 4)
      })

      // ---- Y轴标题（逐字竖排）----
      const yLabel = '总卡路里数'
      ctx.setFontSize(9)
      ctx.setFillStyle('#9CA3AF')
      ctx.setTextAlign('center')
      const charH = 12  // 每字占高
      const labelTotalH = yLabel.length * charH
      const labelStartY = PAD.top + (innerH - labelTotalH) / 2 + charH
      yLabel.split('').forEach((char, i) => {
        ctx.fillText(char, 8, labelStartY + i * charH)
      })

      // ---- 面积填充 ----
      if (data.length > 1) {
        ctx.beginPath()
        ctx.moveTo(toX(0), toY(0))
        data.forEach((d, i) => {
          ctx.lineTo(toX(i), toY(d.value))
        })
        ctx.lineTo(toX(data.length - 1), toY(0))
        ctx.closePath()
        ctx.setFillStyle(fillColor)
        ctx.fill()
      }

      // ---- 折线 ----
      if (data.length > 1) {
        ctx.beginPath()
        ctx.setStrokeStyle(lineColor)
        ctx.setLineWidth(2.5)
        ctx.setLineJoin('round')
        ctx.setLineCap('round')
        data.forEach((d, i) => {
          if (i === 0) ctx.moveTo(toX(i), toY(d.value))
          else ctx.lineTo(toX(i), toY(d.value))
        })
        ctx.stroke()
      }

      // ---- 数据点 + 标签 ----
      data.forEach((d, i) => {
        const x = toX(i)
        const y = toY(d.value)

        if (d.hasData) {
          const valStr = d.value > 0 ? d.value.toFixed(0) : '—'
          if (mode === 'month') {
            // badge 样式
            ctx.setFontSize(10)
            ctx.setTextAlign('center')
            const tm = ctx.measureText(valStr)
            const textW = (tm && tm.width) || 20
            const badgeW = Math.max(textW + 16, 34)
            const badgeH = 18
            const bx = x - badgeW / 2
            const by = y - 26
            const r = 9

            ctx.beginPath()
            ctx.moveTo(bx + r, by)
            ctx.lineTo(bx + badgeW - r, by)
            ctx.arc(bx + badgeW - r, by + r, r, -Math.PI / 2, 0)
            ctx.lineTo(bx + badgeW, by + badgeH - r)
            ctx.arc(bx + badgeW - r, by + badgeH - r, r, 0, Math.PI / 2)
            ctx.lineTo(bx + r, by + badgeH)
            ctx.arc(bx + r, by + badgeH - r, r, Math.PI / 2, Math.PI)
            ctx.lineTo(bx, by + r)
            ctx.arc(bx + r, by + r, r, Math.PI, Math.PI * 1.5)
            ctx.closePath()
            ctx.setFillStyle(lineColor)
            ctx.fill()

            ctx.setFillStyle('#fff')
            ctx.fillText(valStr, x, by + 13)
          } else {
            ctx.setFontSize(10)
            ctx.setFillStyle(lineColor)
            ctx.setTextAlign('center')
            ctx.fillText(valStr, x, y - 10)
          }
        }

        // 数据点
        ctx.beginPath()
        ctx.setFillStyle(lineColor)
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()

        ctx.beginPath()
        ctx.setFillStyle('#fff')
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()

        // X轴标签
        ctx.setFontSize(10)
        ctx.setFillStyle('#374151')
        ctx.setTextAlign('center')
        ctx.fillText(d.label, x, H - 18)
      })

      // X轴副标题
      if (xSubTitle) {
        ctx.setFontSize(9)
        ctx.setFillStyle('#9CA3AF')
        ctx.setTextAlign('center')
        ctx.fillText(xSubTitle, PAD.left + innerW / 2, H - 4)
      }

      // 触发小程序 canvas 渲染
      ctx.draw()
    }, 150)

    return () => clearTimeout(timer)
  }, [data, mode, xSubTitle, canvasId])

  return (
    <Canvas
      key={canvasId}
      canvasId={canvasId}
      style={{width: '100%', height: '200px', display: 'block'}}
    />
  )
}

function StatsPage() {
  const {user} = useAuth()
  const {activeMember, familyMembers, loadingMembers, setActiveMemberById} = useAppStore()
  const [period, setPeriod] = useState<Period>('day')
  const [stats, setStats] = useState<NutritionStats[]>([])
  const [loading, setLoading] = useState(false)
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const [switchingMemberId, setSwitchingMemberId] = useState<string | null>(null)

  const handleSelectMember = useCallback(async (memberId: string) => {
    if (memberId === activeMember?.id) {
      setShowMemberPicker(false)
      return
    }
    setSwitchingMemberId(memberId)
    try {
      await setActiveMemberById(memberId)
      setShowMemberPicker(false)
    } catch (error) {
      console.error('切换统计成员失败:', error)
      Taro.showToast({title: '切换成员失败，请重试', icon: 'none'})
    } finally {
      setSwitchingMemberId(null)
    }
  }, [activeMember?.id, setActiveMemberById])

  const loadStats = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const data = await getNutritionStats(user.id, activeMember?.id || null, period)
      setStats(data)
    } finally {
      setLoading(false)
    }
  }, [user, activeMember?.id, period])

  useEffect(() => { loadStats() }, [loadStats])
  useDidShow(() => { loadStats() })

  useEffect(() => {
    const handleRecordsUpdated = () => { loadStats() }
    Taro.eventCenter.on(NUTRITION_RECORDS_UPDATED, handleRecordsUpdated)
    return () => {
      Taro.eventCenter.off(NUTRITION_RECORDS_UPDATED, handleRecordsUpdated)
    }
  }, [loadStats])

  // 聚合数据 — 直接使用真实数据
  const effectiveStats = stats

  const summary = useMemo(() => {
    const total = effectiveStats.reduce((acc, s) => ({
      calories: acc.calories + s.total_calories,
      protein: acc.protein + s.protein,
      fat: acc.fat + s.fat,
      carbs: acc.carbs + s.carbs
    }), {calories: 0, protein: 0, fat: 0, carbs: 0})
    const days = effectiveStats.length || 1
    return {
      total,
      avg: {
        calories: total.calories / days,
        protein: total.protein / days,
        fat: total.fat / days,
        carbs: total.carbs / days
      }
    }
  }, [effectiveStats])

  // 目标对比（使用成员目标或默认值）
  const calorieGoal = activeMember?.daily_calorie_goal || (activeMember?.gender === 'male' ? 2000 : 1600) || 1800
  const caloriePct = Math.min((summary.avg.calories / calorieGoal) * 100, 120)
  const isOverGoal = summary.avg.calories > calorieGoal

  // 三大营养素分布
  const macroTotal = summary.avg.protein * 4 + summary.avg.fat * 9 + summary.avg.carbs * 4
  const proteinPct = macroTotal > 0 ? Math.round((summary.avg.protein * 4 / macroTotal) * 100) : 0
  const fatPct = macroTotal > 0 ? Math.round((summary.avg.fat * 9 / macroTotal) * 100) : 0
  const carbsPct = macroTotal > 0 ? Math.round((summary.avg.carbs * 4 / macroTotal) * 100) : 0

  // 图表数据 — week: 按天展开本周7天；month: 按自然周聚合
  const {chartData, chartMode, chartXSubTitle} = useMemo(() => {
    const now = new Date()

    if (period === 'week') {
      // 生成本周7天（周日~周六）
      const dayOfWeek = now.getDay() // 0=周日
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek)
      const days: ChartPoint[] = Array.from({length: 7}, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        const found = effectiveStats.find(s => s.date === dateStr)
        return {
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          value: found?.total_calories || 0,
          hasData: !!found && (found.total_calories > 0),
        }
      })
      return {chartData: days, chartMode: 'week' as const, chartXSubTitle: ''}
    } else {
      // 按周聚合：第1~5周，每7天为一组
      const weekMap: Record<number, number> = {}
      for (const s of effectiveStats) {
        const day = parseInt(s.date.split('-')[2])
        const wk = Math.ceil(day / 7)
        weekMap[wk] = (weekMap[wk] || 0) + s.total_calories
      }
      // 本月最多5周
      const totalWeeks = Math.ceil(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() / 7)
      const weeks: ChartPoint[] = Array.from({length: totalWeeks}, (_, i) => ({
        label: `第${i+1}周`,
        value: weekMap[i+1] || 0,
        hasData: (weekMap[i+1] || 0) > 0,
      }))
      return {chartData: weeks, chartMode: 'month' as const, chartXSubTitle: ''}
    }
  }, [period, effectiveStats])

  const periodLabels: Record<Period, string> = {day: '今日', week: '本周', month: '本月'}

  return (
    <div className="min-h-screen bg-background">
      {/* 时间筛选 */}
      <div className="flex bg-card border-b border-border px-4 py-3">
        <div className="flex bg-secondary rounded-xl p-1 w-full">
          {(['day', 'week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              type="button"
              className={`flex-1 flex items-center justify-center leading-none text-xl font-medium rounded-lg transition ${period === p ? 'bg-white text-primary shadow-elegant' : 'text-muted-foreground'}`}
              style={{height: '40px'}}
              onClick={() => setPeriod(p)}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 pb-tabbar flex flex-col gap-4">
        {/* 成员提示 */}
        {activeMember && (
          <button
            type="button"
            disabled={loadingMembers || switchingMemberId !== null}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-primary/10 rounded-xl border border-primary/20 disabled:opacity-60"
            onClick={() => setShowMemberPicker(true)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Image
                src={getMemberAvatar(activeMember)}
                mode="aspectFill"
                style={{width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0}}
              />
              <span className="text-xl text-primary truncate">当前查看：{activeMember.nickname}</span>
            </div>
            <div className="flex items-center gap-1 text-primary flex-shrink-0">
              <span className="text-xl font-medium">切换</span>
              <div className="i-mdi-chevron-right text-2xl" />
            </div>
          </button>
        )}

        {loading ? (
          <div className="flex flex-col gap-4 py-8">
            {[1,2,3].map(i => (
              <div key={i} className="h-32 bg-card rounded-2xl animate-breathe" />
            ))}
          </div>
        ) : effectiveStats.length === 0 ? (
          /* 真实空状态 */
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-20 h-20 bg-secondary rounded-3xl flex items-center justify-center">
              <div className="i-mdi-chart-bar-stacked text-5xl text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold text-foreground">暂无饮食记录</p>
            <p className="text-xl text-muted-foreground text-center px-8">在首页拍照或手动录入食材后，{periodLabels[period]}数据将在此展示</p>
            <button
              type="button"
              className="flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl px-6 shadow-elegant"
              style={{height: '48px'}}
              onClick={() => Taro.switchTab({url: '/pages/home/index'})}
            >
              <div className="i-mdi-plus text-2xl" />
              <span>去记录饮食</span>
            </button>
          </div>
        ) : (
          <>
            {/* 热量摘要卡片 */}
            <div className="bg-gradient-primary rounded-2xl p-5 shadow-elegant">
              <p className="text-xl text-white/80 mb-1">{periodLabels[period]}平均热量</p>
              <div className="flex items-end gap-2">
                <span className="text-white font-bold" style={{fontSize: '48px', lineHeight: 1}}>
                  {summary.avg.calories.toFixed(0)}
                </span>
                <span className="text-white/80 text-2xl mb-2">kcal</span>
              </div>
              {period !== 'day' && (
                <p className="text-xl text-white/80 mt-1">累计：{summary.total.calories.toFixed(0)} kcal</p>
              )}
            </div>

            {/* 热量目标进度 */}
            <div className="bg-card rounded-2xl p-4 shadow-elegant">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="i-mdi-flag-checkered text-2xl text-primary" />
                  <span className="text-xl font-semibold text-foreground">热量目标</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl text-muted-foreground">{summary.avg.calories.toFixed(0)}</span>
                  <span className="text-xl text-muted-foreground">/</span>
                  <span className="text-xl font-semibold text-foreground">{calorieGoal}</span>
                  <span className="text-xl text-muted-foreground">kcal</span>
                </div>
              </div>
              <div className="h-4 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isOverGoal ? 'bg-destructive' : 'bg-gradient-primary'}`}
                  style={{width: `${Math.min(caloriePct, 100)}%`}}
                />
              </div>
              {isOverGoal && (
                <p className="text-xl text-destructive mt-2">已超出每日热量目标</p>
              )}
              {!activeMember?.daily_calorie_goal && (
                <button
                  type="button"
                  className="flex items-center justify-center leading-none mt-3 text-xl font-medium text-primary border-2 border-primary rounded-xl px-4 py-2 transition active:bg-primary active:text-white"
                  style={{height: '40px'}}
                  onClick={() => Taro.navigateTo({url: '/pages/personal-info/index'})}
                >点击设置您的目标</button>
              )}
            </div>

            {/* 三大营养素环形图（用色块模拟） */}
            <div className="bg-card rounded-2xl p-4 shadow-elegant">
              <div className="flex items-center gap-2 mb-4">
                <div className="i-mdi-chart-donut text-2xl text-primary" />
                <span className="text-xl font-semibold text-foreground">营养素分布</span>
              </div>
              {/* 横向进度条展示 */}
              <div className="flex flex-col gap-3">
                {[
                  {label: '碳水化合物', value: summary.avg.carbs, unit: 'g', pct: carbsPct, color: 'bg-chart-1'},
                  {label: '蛋白质', value: summary.avg.protein, unit: 'g', pct: proteinPct, color: 'bg-chart-2'},
                  {label: '脂肪', value: summary.avg.fat, unit: 'g', pct: fatPct, color: 'bg-chart-3'},
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xl text-foreground">{item.label}</span>
                      <span className="text-xl text-muted-foreground">{item.value.toFixed(1)}g ({item.pct}%)</span>
                    </div>
                    <div className="h-3 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color}`}
                        style={{width: `${item.pct}%`, background: item.color === 'bg-chart-1' ? 'hsl(var(--chart-1))' : item.color === 'bg-chart-2' ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-3))'}}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 热量趋势折线图 */}
            {period !== 'day' && (
              <div className="bg-card rounded-2xl p-4 shadow-elegant">
                {/* 标题行 + 图例 */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xl font-semibold text-foreground">
                    {period === 'week' ? '本周热量趋势' : '本月热量趋势'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="rounded-full"
                      style={{width: '10px', height: '10px', backgroundColor: period === 'week' ? '#60B3E8' : '#F5A524'}}
                    />
                    <span className="text-xl" style={{color: period === 'week' ? '#60B3E8' : '#F5A524'}}>
                      {period === 'week' ? '每日热量' : '每周合计'}
                    </span>
                  </div>
                </div>
                <TrendLineChart data={chartData} mode={chartMode} xSubTitle={chartXSubTitle} />
              </div>
            )}

            {/* 今日营养详情 */}
            <div className="bg-card rounded-2xl p-4 shadow-elegant">
              <div className="flex items-center gap-2 mb-4">
                <div className="i-mdi-nutrition text-2xl text-primary" />
                <span className="text-xl font-semibold text-foreground">营养摘要</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {label: '总热量', value: `${summary.total.calories.toFixed(0)} kcal`},
                  {label: '平均热量', value: `${summary.avg.calories.toFixed(0)} kcal`},
                  {label: '蛋白质', value: `${summary.total.protein.toFixed(1)} g`},
                  {label: '脂肪', value: `${summary.total.fat.toFixed(1)} g`},
                  {label: '碳水', value: `${summary.total.carbs.toFixed(1)} g`},
                  {label: '记录次数', value: `${effectiveStats.reduce((a, s) => a + s.records_count, 0)} 次`},
                ].map(item => (
                  <div key={item.label} className="bg-secondary rounded-xl px-3 py-3">
                    <p className="text-xl text-muted-foreground">{item.label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showMemberPicker && (
        <div className="fixed inset-0 flex flex-col justify-end" style={{zIndex: 9999}}>
          <div
            className="absolute inset-0"
            style={{backgroundColor: 'rgba(0,0,0,0.42)'}}
            onClick={() => switchingMemberId === null && setShowMemberPicker(false)}
          />
          <div
            className="relative bg-white flex flex-col"
            style={{maxHeight: '70vh', borderRadius: '16px 16px 0 0', paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="rounded-full" style={{width: '40px', height: '4px', backgroundColor: '#D8D8D8'}} />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
              <div>
                <p className="text-2xl font-semibold text-foreground">切换查看成员</p>
                <p className="text-xl text-muted-foreground mt-1">统计数据和营养目标将同步切换</p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center"
                style={{width: '40px', height: '40px'}}
                onClick={() => switchingMemberId === null && setShowMemberPicker(false)}
              >
                <div className="i-mdi-close text-2xl text-muted-foreground" />
              </button>
            </div>
            <div className="overflow-y-auto px-5">
              {familyMembers.map(member => {
                const selected = member.id === activeMember?.id
                const switching = member.id === switchingMemberId
                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={switchingMemberId !== null}
                    className="w-full flex items-center justify-between gap-3 py-4 border-b border-border disabled:opacity-60"
                    onClick={() => void handleSelectMember(member.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Image
                        src={getMemberAvatar(member)}
                        mode="aspectFill"
                        style={{width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0}}
                      />
                      <div className="text-left min-w-0">
                        <p className="text-xl font-medium text-foreground truncate">{member.nickname}</p>
                        {member.is_primary && <p className="text-xl text-muted-foreground mt-1">主成员</p>}
                      </div>
                    </div>
                    {switching
                      ? <div className="i-mdi-loading text-2xl text-primary" style={{animation: 'spin 1s linear infinite'}} />
                      : selected && <div className="i-mdi-check text-2xl text-primary" />}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="flex items-center justify-center gap-2 mx-5 mt-3 text-xl font-medium text-primary"
              style={{height: '48px'}}
              onClick={() => {
                setShowMemberPicker(false)
                Taro.navigateTo({url: '/pages/family/index'})
              }}
            >
              <div className="i-mdi-account-multiple-plus text-2xl" />
              <span>管理家庭成员</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(StatsPage)
