import Taro from '@tarojs/taro'

declare const __SHOW_PRIVACY_SCOPE_MODAL__: string | undefined

export function isPrivacyScopeError(error: unknown): boolean {
  const err = error as any
  const errMsg = err?.errMsg || err?.message || ''
  return err?.errno === 112 || errMsg.includes('api scope is not declared in the privacy agreement')
}

export function isUserCancelError(error: unknown): boolean {
  const errMsg = ((error as any)?.errMsg || (error as any)?.message || '').toLowerCase()
  return errMsg.includes('cancel')
}

export function showPrivacyScopeDeclarationTip(apiName: string) {
  if (__SHOW_PRIVACY_SCOPE_MODAL__ !== 'true') {
    console.warn(`[privacy] ${apiName} 隐私接口未在后台声明，已跳过弹窗。`)
    Taro.showToast({title: `${apiName} 权限暂不可用`, icon: 'none'})
    return
  }
  Taro.showModal({
    title: '隐私配置未完成',
    content: `当前小程序后台的《用户隐私保护指引》未声明 ${apiName} 所需的隐私接口，请在微信公众平台补充后重新发布/预览。`,
    showCancel: false,
    confirmText: '知道了'
  })
}
