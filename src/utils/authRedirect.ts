import Taro from '@tarojs/taro'

export const STORAGE_KEY_REDIRECT_PATH = 'loginRedirectPath'
const DEFAULT_REDIRECT = '/pages/home/index'
const TAB_BAR_PATHS = new Set([
  '/pages/home/index',
  '/pages/chat/index',
  '/pages/stats/index',
  '/pages/profile/index'
])

export function buildCurrentRouteUrl(): string {
  const router = Taro.getCurrentInstance()?.router
  const path = router?.path ? `/${router.path.replace(/^\//, '')}` : ''
  if (!path) return ''

  const query = Object.entries(router?.params || {})
    .filter(([key, value]) => key !== '$taroTimestamp' && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return query ? `${path}?${query}` : path
}

export function getStoredRedirect(): string {
  return Taro.getStorageSync(STORAGE_KEY_REDIRECT_PATH) || DEFAULT_REDIRECT
}

export function clearStoredRedirect(): void {
  Taro.removeStorageSync(STORAGE_KEY_REDIRECT_PATH)
}

export function completeLoginRedirect(): void {
  const target = getStoredRedirect()
  clearStoredRedirect()
  const path = target.split('?')[0]
  if (TAB_BAR_PATHS.has(path)) {
    Taro.switchTab({url: path})
  } else {
    Taro.redirectTo({url: target})
  }
}
