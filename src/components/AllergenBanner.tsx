// 过敏源安全提示
interface AllergenBannerProps {
  allergenNames: string
  onClose?: () => void
}

export function AllergenBanner({allergenNames, onClose}: AllergenBannerProps) {
  if (!allergenNames) return null
  return (
    <div className="fixed inset-0 flex items-center justify-center px-6" style={{zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.38)'}}>
      <div className="w-full max-w-sm bg-white rounded-2xl px-5 py-6 shadow-elegant">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="flex items-center justify-center rounded-full" style={{width: '52px', height: '52px', backgroundColor: '#FEF2F2'}}>
            <div className="i-mdi-alert-circle text-3xl" style={{color: '#DC2626'}} />
          </div>
          <p className="text-2xl font-semibold text-foreground">饮食安全提示</p>
          <p className="text-xl text-muted-foreground leading-relaxed">检测到可能含有您的过敏源 {allergenNames}，请谨慎食用。</p>
          <button
            type="button"
            className="w-full flex items-center justify-center text-xl font-semibold text-white bg-primary rounded-xl mt-2"
            style={{height: '48px'}}
            onClick={onClose}
          >我知道了</button>
        </div>
      </div>
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
