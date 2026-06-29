// 免责声明弹窗 — 全屏蒙层，阻断底层所有交互
import {useState} from 'react'
import Taro from '@tarojs/taro'

interface DisclaimerModalProps {
  visible: boolean
  onAgree: () => void
}

export function DisclaimerModal({visible, onAgree}: DisclaimerModalProps) {
  const [agreed, setAgreed] = useState(false)

  if (!visible) return null

  return (
    // 全屏蒙层：z-[9999] 确保高于所有页面元素；catTouchMove 等效通过 onTouchMove stopPropagation 阻止滚动穿透
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.65)'}}
      onTouchMove={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 内容卡片：白色实色背景，强制用户主动同意 */}
      <div
        className="w-full rounded-t-3xl px-6 pt-8"
        style={{
          backgroundColor: '#ffffff',
          maxHeight: '80vh',
          overflowY: 'auto',
          paddingBottom: 'calc(40px + 50px + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-gradient-primary rounded-2xl flex items-center justify-center mb-4">
            <div className="i-mdi-heart-pulse text-4xl text-white" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">智能健康助手</h2>
          <p className="text-xl text-muted-foreground mt-1">健康管理工具</p>
        </div>

        <div className="bg-secondary rounded-xl p-4 mb-6" style={{maxHeight: '30vh', overflowY: 'auto'}}>
          <h3 className="text-xl font-semibold text-foreground mb-3">使用须知与免责声明</h3>
          <p className="text-xl text-muted-foreground leading-relaxed mb-3">
            本应用提供的营养分析及健康建议<span className="font-semibold text-foreground">仅供参考</span>，不能替代专业医生或营养师诊断，请勿据此自行调整治疗方案。
          </p>
          <p className="text-xl text-muted-foreground leading-relaxed mb-3">
            本产品定位为<span className="font-semibold text-foreground">健康管理工具</span>，不属于医疗器械。涉及疾病饮食禁忌的建议，请遵医嘱。
          </p>
          <p className="text-xl text-muted-foreground leading-relaxed mb-3">
            您的健康数据（慢性病、过敏源、用药信息等）将加密存储，不用于广告投放，符合《个人信息保护法》相关规定。
          </p>
          <p className="text-xl text-muted-foreground leading-relaxed">
            使用本应用需要开启蓝牙权限（连接营养秤）、相机权限（拍照识别食材）和麦克风权限（语音输入）。
          </p>
        </div>

        <div className="flex items-start gap-3 mb-6">
          {/* 独立勾选按钮 — button 确保 weapp 可靠触发并提供 active 反馈 */}
          <button
            type="button"
            className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all active:opacity-60 active:scale-90 ${agreed ? 'bg-primary border-primary' : 'border-border bg-background'}`}
            onClick={() => setAgreed(!agreed)}
          >
            {agreed && <div className="i-mdi-check text-xl" style={{color: '#333333'}} />}
          </button>
          {/* 文字 + 链接解耦，链接单独跳转 */}
          <div className="flex flex-wrap items-center text-xl text-muted-foreground" style={{gap: '2px'}}>
            <span onClick={() => setAgreed(!agreed)}>我已阅读并同意</span>
            <span
              className="text-primary font-medium"
              onClick={(e) => { (e as any).stopPropagation?.(); Taro.navigateTo({url: '/pages/agreement/index'}) }}
            >《用户协议》</span>
            <span onClick={() => setAgreed(!agreed)}>和</span>
            <span
              className="text-primary font-medium"
              onClick={(e) => { (e as any).stopPropagation?.(); Taro.navigateTo({url: '/pages/privacy/index'}) }}
            >《隐私政策》</span>
            <span onClick={() => setAgreed(!agreed)}>及健康数据处理说明</span>
          </div>
        </div>

        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none text-2xl font-semibold rounded-xl transition ${agreed ? 'bg-gradient-primary text-white shadow-elegant' : 'bg-muted text-muted-foreground'}`}
          style={{height: '56px'}}
          onClick={() => { if (agreed) onAgree() }}
        >
          {agreed ? '进入应用' : '请先阅读并勾选同意'}
        </button>
      </div>
    </div>
  )
}
