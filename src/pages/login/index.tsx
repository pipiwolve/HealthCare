// @title 登录
import {useState} from 'react'
import Taro from '@tarojs/taro'
import {useAuth} from '@/contexts/AuthContext'

export default function LoginPage() {
  const {signInWithUsername, signUpWithUsername, signInWithWechat} = useAuth()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)

  const isWeApp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

  const handleSubmit = async () => {
    if (!username.trim()) {
      Taro.showToast({title: '请输入用户名', icon: 'none'})
      return
    }
    if (password.length < 6) {
      Taro.showToast({title: '密码至少6位', icon: 'none'})
      return
    }
    if (!agreed) {
      Taro.showToast({title: '请先阅读并同意用户协议', icon: 'none'})
      return
    }
    setLoading(true)
    try {
      const fn = tab === 'login' ? signInWithUsername : signUpWithUsername
      const {error} = await fn(username.trim(), password)
      if (error) {
        Taro.showToast({title: error.message || '操作失败', icon: 'none'})
      } else {
        const redirectPath = Taro.getStorageSync('loginRedirectPath') || '/pages/home/index'
        Taro.removeStorageSync('loginRedirectPath')
        const tabBarPaths = ['/pages/home/index', '/pages/chat/index', '/pages/stats/index', '/pages/profile/index']
        if (tabBarPaths.includes(redirectPath)) {
          Taro.switchTab({url: redirectPath})
        } else {
          Taro.redirectTo({url: redirectPath})
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleWechatLogin = async () => {
    if (!agreed) {
      Taro.showToast({title: '请先阅读并同意用户协议', icon: 'none'})
      return
    }
    setLoading(true)
    try {
      const {error} = await signInWithWechat()
      if (error) {
        Taro.showToast({title: error.message || '微信登录失败', icon: 'none'})
      } else {
        const redirectPath = Taro.getStorageSync('loginRedirectPath') || '/pages/home/index'
        Taro.removeStorageSync('loginRedirectPath')
        const tabBarPaths = ['/pages/home/index', '/pages/chat/index', '/pages/stats/index', '/pages/profile/index']
        if (tabBarPaths.includes(redirectPath)) {
          Taro.switchTab({url: redirectPath})
        } else {
          Taro.redirectTo({url: redirectPath})
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{background: 'var(--gradient-subtle)'}}>
      {/* 顶部品牌区 */}
      <div className="flex flex-col items-center pt-20 pb-10 px-8 bg-gradient-primary">
        <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mb-4">
          <div className="i-mdi-heart-pulse text-5xl text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white">智能健康助手</h1>
        <p className="text-xl text-white/80 mt-2">AI营养秤伴侣应用</p>
      </div>

      {/* 登录卡片 */}
      <div className="flex-1 px-6 pt-8">
        {/* Tab切换 */}
        <div className="flex bg-secondary rounded-xl p-1 mb-6">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              type="button"
              className={`flex-1 flex items-center justify-center leading-none text-xl font-semibold rounded-lg transition ${tab === t ? 'bg-white text-primary shadow-elegant' : 'text-muted-foreground'}`}
              style={{height: '44px'}}
              onClick={() => setTab(t)}
            >
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <p className="text-xl text-muted-foreground mb-2">用户名</p>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-card">
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="请输入用户名（字母/数字/下划线）"
                value={username}
                onInput={(e) => { const ev = e as any; setUsername(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
          </div>
          <div>
            <p className="text-xl text-muted-foreground mb-2">密码</p>
            <div className="border-2 border-input rounded-xl px-4 py-3 bg-card">
              <input
                type="password"
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder="请输入密码（至少6位）"
                value={password}
                onInput={(e) => { const ev = e as any; setPassword(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
          </div>
        </div>

        {/* 协议勾选 — checkbox 与文字链接完全解耦 */}
        <div className="flex items-start gap-3 mb-6">
          {/* 独立勾选按钮 — 使用 button 确保 weapp 可靠响应点击并有 active 反馈 */}
          <button
            type="button"
            className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all active:opacity-60 active:scale-90 ${agreed ? 'bg-primary border-primary' : 'border-border bg-background'}`}
            onClick={() => setAgreed(!agreed)}
          >
            {agreed && <div className="i-mdi-check text-xl" style={{color: '#333333'}} />}
          </button>
          {/* 文字 + 可点击链接 */}
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

        {/* 提交按钮 */}
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none text-2xl font-semibold rounded-xl mb-4 transition ${loading ? 'bg-primary/50 text-white' : 'bg-gradient-primary text-white shadow-elegant'}`}
          style={{height: '56px'}}
          onClick={handleSubmit}
        >
          {loading ? '处理中...' : tab === 'login' ? '登录' : '注册'}
        </button>

        {/* 微信登录 */}
        {isWeApp && (
          <button
            type="button"
            className="w-full flex items-center justify-center leading-none gap-3 text-xl font-semibold rounded-xl border-2 border-border bg-card text-foreground"
            style={{height: '52px'}}
            onClick={handleWechatLogin}
          >
            <div className="i-mdi-wechat text-2xl text-green-600" />
            <span>微信一键登录</span>
          </button>
        )}
      </div>
    </div>
  )
}
