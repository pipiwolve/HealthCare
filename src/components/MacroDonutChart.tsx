import {Canvas} from '@tarojs/components'
import {useEffect, useMemo} from 'react'
import {getChartCanvasContext} from '@/utils/chartCanvas'
import {calculateMacroDistribution} from '@/utils/macronutrients'

export function MacroDonutChart({
  carbs,
  protein,
  fat,
}: {
  carbs: number
  protein: number
  fat: number
}) {
  const distribution = useMemo(
    () => calculateMacroDistribution({carbs, protein, fat}),
    [carbs, fat, protein],
  )
  const canvasId = 'macro-donut-chart'

  useEffect(() => {
    const timer = setTimeout(() => {
      const ctx = getChartCanvasContext(canvasId)
      if (!ctx) return
      const size = 220
      const center = size / 2
      const radius = 76
      const lineWidth = 30
      const startAngle = -Math.PI / 2

      ctx.clearRect(0, 0, size, size)
      ctx.beginPath()
      ctx.setStrokeStyle('#EDF1ED')
      ctx.setLineWidth(lineWidth)
      ctx.arc(center, center, radius, 0, Math.PI * 2)
      ctx.stroke()

      let currentAngle = startAngle
      distribution.items.forEach(item => {
        if (item.ratio <= 0) return
        const endAngle = currentAngle + item.ratio * Math.PI * 2
        ctx.beginPath()
        ctx.setStrokeStyle(item.color)
        ctx.setLineWidth(lineWidth)
        ctx.setLineCap('butt')
        ctx.arc(center, center, radius, currentAngle, endAngle)
        ctx.stroke()
        currentAngle = endAngle
      })

      ctx.setTextAlign('center')
      ctx.setFillStyle('#6B7280')
      ctx.setFontSize(13)
      ctx.fillText('平均供能', center, center - 17)
      ctx.setFillStyle('#111827')
      ctx.setFontSize(28)
      ctx.fillText(distribution.totalCalories.toFixed(0), center, center + 17)
      ctx.setFillStyle('#6B7280')
      ctx.setFontSize(12)
      ctx.fillText('kcal', center, center + 38)
      ctx.draw()
    }, 120)

    return () => clearTimeout(timer)
  }, [distribution])

  return (
    <div>
      <div className="flex justify-center" style={{height: '220px'}}>
        <Canvas canvasId={canvasId} style={{width: '220px', height: '220px', display: 'block'}} />
      </div>
      <div className="flex flex-col gap-2 mt-1">
        {distribution.items.map(item => (
          <div key={item.key} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="rounded-full flex-shrink-0"
                style={{width: '10px', height: '10px', backgroundColor: item.color}}
              />
              <span className="text-lg text-foreground truncate">{item.label}</span>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-lg font-semibold text-foreground">{item.grams.toFixed(1)}g</span>
              <span className="text-lg text-muted-foreground ml-1.5">{item.percentage}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
