import Taro from '@tarojs/taro'

export interface ChartCanvasContext {
  arc: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => void
  beginPath: () => void
  clearRect: (x: number, y: number, width: number, height: number) => void
  closePath: () => void
  draw: () => void
  fill: () => void
  fillText: (text: string, x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  measureText: (text: string) => {width: number}
  moveTo: (x: number, y: number) => void
  setFillStyle: (color: string) => void
  setFontSize: (fontSize: number) => void
  setLineCap: (lineCap: CanvasLineCap) => void
  setLineDash: (pattern: number[], offset: number) => void
  setLineJoin: (lineJoin: CanvasLineJoin) => void
  setLineWidth: (lineWidth: number) => void
  setStrokeStyle: (color: string) => void
  setTextAlign: (textAlign: CanvasTextAlign) => void
  stroke: () => void
}

function getH5CanvasContext(canvasId: string): ChartCanvasContext | null {
  const selector = `canvas[canvas-id="${canvasId}"]`
  const canvas = (
    document.querySelector(`.taro_page_show ${selector}`)
    ?? document.querySelector(selector)
  ) as HTMLCanvasElement | null
  const context = canvas?.getContext('2d')
  if (!context) return null

  return {
    arc: context.arc.bind(context),
    beginPath: context.beginPath.bind(context),
    clearRect: context.clearRect.bind(context),
    closePath: context.closePath.bind(context),
    draw: () => undefined,
    fill: context.fill.bind(context),
    fillText: context.fillText.bind(context),
    lineTo: context.lineTo.bind(context),
    measureText: context.measureText.bind(context),
    moveTo: context.moveTo.bind(context),
    setFillStyle: color => { context.fillStyle = color },
    setFontSize: fontSize => { context.font = `${fontSize}px sans-serif` },
    setLineCap: lineCap => { context.lineCap = lineCap },
    setLineDash: (pattern, offset) => {
      context.setLineDash(pattern)
      context.lineDashOffset = offset
    },
    setLineJoin: lineJoin => { context.lineJoin = lineJoin },
    setLineWidth: lineWidth => { context.lineWidth = lineWidth },
    setStrokeStyle: color => { context.strokeStyle = color },
    setTextAlign: textAlign => { context.textAlign = textAlign },
    stroke: context.stroke.bind(context),
  }
}

export function getChartCanvasContext(canvasId: string): ChartCanvasContext | null {
  if (process.env.TARO_ENV === 'h5') return getH5CanvasContext(canvasId)
  return Taro.createCanvasContext(canvasId) as unknown as ChartCanvasContext
}
