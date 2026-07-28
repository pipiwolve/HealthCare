import {useCallback, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import {
  bindWechatAccount,
  getWechatAccountStatus,
  prepareWechatBinding,
  unbindWechatAccount,
  type WechatAccountStatus
} from '@/services/wechatAuth'

type AccountDialog = 'none' | 'unbind'

function AccountSettingsPage() {
  const [status, setStatus] = useState<WechatAccountStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<AccountDialog>('none')
  const [password, setPassword] = useState('')

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getWechatAccountStatus())
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '账号状态加载失败', icon: 'none'})
    }
  }, [])

  useDidShow(() => { void loadStatus() })

  const closeDialog = () => {
    if (loading) return
    setDialog('none')
    setPassword('')
  }

  const handleBind = async () => {
    const {confirm} = await Taro.showModal({
      title: '绑定当前微信',
      content: '确认将当前微信绑定为此账号的登录方式？绑定后可使用微信快捷登录。',
      confirmText: '确认绑定'
    })
    if (!confirm) return
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

  const handleUnbind = async () => {
    if (password.length < 6) {
      Taro.showToast({title: '请输入当前账号密码', icon: 'none'})
      return
    }
    setLoading(true)
    try {
      await unbindWechatAccount(password)
      await loadStatus()
      setDialog('none')
      setPassword('')
      Taro.showToast({title: '微信已解绑', icon: 'success'})
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '微信解绑失败', icon: 'none'})
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-4">
      <div className="bg-card border border-border rounded-xl px-4 py-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="i-mdi-account-key text-3xl text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-xl font-semibold text-foreground">
              {status?.loginType === 'username' ? '历史账号' : '邮箱账户'}
            </p>
            <p className="text-xl text-muted-foreground break-all">
              {status?.hasPasswordLogin ? status.loginIdentifier : status ? '未设置' : '加载中...'}
            </p>
          </div>
          <div className={`text-xl font-medium ${status?.hasPasswordLogin ? 'text-primary' : 'text-muted-foreground'}`}>
            {status?.hasPasswordLogin ? '已配置' : status ? '未配置' : '--'}
          </div>
        </div>
        {status && !status.hasPasswordLogin && (
          <p className="text-xl text-muted-foreground pt-3 mt-3 border-t border-border">
            当前账号仅支持微信登录，尚未配置邮箱账户。
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="i-mdi-wechat text-3xl text-green-600" />
          <div className="flex-1">
            <p className="text-xl font-semibold text-foreground">微信登录</p>
            <p className="text-xl text-muted-foreground">{status?.bound ? '已绑定当前账号' : status ? '未绑定' : '加载中...'}</p>
          </div>
          <div className={`text-xl font-medium ${status?.bound ? 'text-primary' : 'text-muted-foreground'}`}>
            {status?.bound ? '已连接' : status ? '未连接' : '--'}
          </div>
        </div>
        {status?.phoneMasked && (
          <div className="flex items-center justify-between py-3 mt-3 border-t border-border">
            <span className="text-xl text-muted-foreground">授权手机号</span>
            <span className="text-xl text-foreground">{status.phoneMasked}</span>
          </div>
        )}
        {status && !status.bound && (
          <button
            type="button"
            disabled={loading}
            className="w-full flex items-center justify-center text-xl font-semibold bg-primary text-white rounded-xl mt-4 disabled:opacity-50"
            style={{height: '48px'}}
            onClick={handleBind}
          >{loading ? '绑定中...' : '绑定当前微信'}</button>
        )}
        {status?.bound && (
          <>
            <button
              type="button"
              disabled={loading || !status.hasPasswordLogin}
              className="w-full flex items-center justify-center text-xl font-medium border border-destructive text-destructive rounded-xl mt-4 disabled:opacity-40"
              style={{height: '48px'}}
              onClick={() => setDialog('unbind')}
            >解绑微信</button>
            {!status.hasPasswordLogin && (
              <p className="text-xl text-muted-foreground mt-2">配置邮箱账户前不能解绑微信。</p>
            )}
          </>
        )}
      </div>

      <p className="text-xl text-muted-foreground mt-3 px-1">绑定后，邮箱和微信将登录同一账户；两个已独立存在的账户不会自动合并数据。</p>

      {dialog !== 'none' && (
        <div className="fixed inset-0 flex flex-col justify-end" style={{zIndex: 1000}}>
          <div className="absolute inset-0" style={{backgroundColor: 'rgba(0,0,0,0.45)'}} onClick={closeDialog} />
          <div
            className="relative bg-white px-6 pt-3 safe-area-bottom"
            style={{borderRadius: '16px 16px 0 0', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))'}}
          >
            <div className="flex justify-center pb-3">
              <div className="rounded-full" style={{width: '40px', height: '4px', backgroundColor: '#D8D8D8'}} />
            </div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-2xl font-semibold text-foreground">确认解绑微信</p>
                <p className="text-xl text-muted-foreground mt-1">解绑后请使用 {status?.loginIdentifier || ''} 登录</p>
              </div>
              <button type="button" className="flex items-center justify-center" style={{width: '40px', height: '40px'}} onClick={closeDialog}>
                <div className="i-mdi-close text-2xl text-muted-foreground" />
              </button>
            </div>

            <div className="border border-input rounded-xl px-4 bg-card mb-3 flex items-center" style={{height: '50px'}}>
              <input
                type="password"
                value={password}
                maxLength={72}
                placeholder="输入当前账号密码"
                className="w-full text-xl text-foreground bg-transparent outline-none"
                onInput={(event) => setPassword((event as any).detail?.value ?? (event as any).target?.value ?? '')}
              />
            </div>
            <button
              type="button"
              disabled={loading}
              className="w-full flex items-center justify-center text-xl font-semibold text-white rounded-xl disabled:opacity-50 bg-destructive"
              style={{height: '50px'}}
              onClick={handleUnbind}
            >{loading ? '处理中...' : '确认解绑'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default withRouteGuard(AccountSettingsPage)
