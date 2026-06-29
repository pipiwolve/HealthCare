// 过敏源预警Banner
interface AllergenBannerProps {
  allergenNames: string
  onClose?: () => void
}

export function AllergenBanner({allergenNames, onClose}: AllergenBannerProps) {
  if (!allergenNames) return null
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-destructive">
      <div className="i-mdi-alert text-2xl text-white flex-shrink-0" />
      <span className="flex-1 text-xl text-white font-medium">
        含您的过敏原：{allergenNames}，请谨慎食用
      </span>
      {onClose && (
        <div className="i-mdi-close text-2xl text-white" onClick={onClose} />
      )}
    </div>
  )
}

// 免责声明底部小字 — 灰色小字常驻，字号10px，颜色#999；底部padding已含TabBar高度
export function DisclaimerFooter() {
  return (
    <div className="px-4 pb-tabbar pt-2">
      <p className="text-center leading-relaxed" style={{fontSize: '10px', color: '#999999'}}>
        本分析结果仅供参考，不能替代专业医生或营养师诊断
      </p>
    </div>
  )
}
