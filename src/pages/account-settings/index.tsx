import {useCallback, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import {bindWechatAccount, getWechatAccountStatus, prepareWechatBinding, type WechatAccountStatus} from '@/services/wechatAuth'

function AccountSettingsPage() {
  const [status, setStatus] = useState<WechatAccountStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getWechatAccountStatus())
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '账号状态加载失败', icon: 'none'})
    }
  }, [])

  useDidShow(() => { void loadStatus() })

  const handleBind = async () => {
    setLoading(true)
    try {
      const ticket = await prepareWechatBinding()
      await bindWechatAccount(ticket)
      await loadStatus()
      Taro.showToast({title: '微信绑定成功', icon: 'success'})
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '微信绑定失败', icon: 'none'})
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <div className="bg-card border border-border rounded-xl px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="i-mdi-wechat text-3xl text-green-600" />
          <div className="flex-1">
            <p className="text-xl font-semibold text-foreground">微信账号</p>
            <p className="text-xl text-muted-foreground">{status?.bound ? '已绑定' : '未绑定'}</p>
          </div>
          <div className={`text-xl font-medium ${status?.bound ? 'text-primary' : 'text-muted-foreground'}`}>
            {status?.bound ? '已连接' : '未连接'}
          </div>
        </div>
        {status?.phoneMasked && (
          <div className="flex items-center justify-between py-3 border-t border-border">
            <span className="text-xl text-muted-foreground">授权手机号</span>
            <span className="text-xl text-foreground">{status.phoneMasked}</span>
          </div>
        )}
        {!status?.bound && (
          <button
            type="button"
            disabled={loading}
            className="w-full flex items-center justify-center text-xl font-semibold bg-primary text-white rounded-xl mt-3 disabled:opacity-50"
            style={{height: '48px'}}
            onClick={handleBind}
          >{loading ? '绑定中...' : '绑定当前微信'}</button>
        )}
      </div>
      <p className="text-xl text-muted-foreground mt-3 px-1">为保护健康数据，本期不支持在小程序内自动合并或解绑账号。</p>
    </div>
  )
}

export default withRouteGuard(AccountSettingsPage)
