// @title 登录

import {Image} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {useState} from 'react'
import {supabase} from '@/client/supabase'
import {useAuth} from '@/contexts/AuthContext'
import {getFamilyMembers, updateFamilyMember, updateProfile} from '@/db/api'
import {uploadWechatAvatar} from '@/services/wechatAuth'
import {useAppStore} from '@/store/appStore'
import {completeLoginRedirect} from '@/utils/authRedirect'

type WechatStep = 'idle' | 'choice' | 'bind'

export default function LoginPage() {
  const {
    signInWithUsername,
    signUpWithUsername,
    startWechatSignIn,
    registerWechatSignIn,
    bindWechatSignIn,
    signOut,
    refreshProfile
  } = useAuth()
  const {refreshMembers} = useAppStore()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [wechatStep, setWechatStep] = useState<WechatStep>('idle')
  const [wechatTicket, setWechatTicket] = useState('')
  const [wechatNickname, setWechatNickname] = useState('')
  const [wechatAvatarPath, setWechatAvatarPath] = useState('')

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
        completeLoginRedirect()
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
      const {data, error} = await startWechatSignIn()
      if (error) {
        Taro.showToast({title: error.message || '微信登录失败', icon: 'none'})
      } else if (data?.status === 'authenticated') {
        completeLoginRedirect()
      } else {
        setWechatTicket(data?.status === 'unbound' ? data.registrationTicket : '')
        setWechatStep('choice')
      }
    } finally {
      setLoading(false)
    }
  }

  const saveWechatProfile = async () => {
    const {data: {user}} = await supabase.auth.getUser()
    if (!user) throw new Error('微信账号登录状态未就绪')
    const avatarUrl = wechatAvatarPath ? await uploadWechatAvatar(wechatAvatarPath) : undefined
    const updates = {
      ...(wechatNickname.trim() ? {nickname: wechatNickname.trim()} : {}),
      ...(avatarUrl ? {avatar_url: avatarUrl} : {})
    }
    if (Object.keys(updates).length === 0) return
    if (!await updateProfile(user.id, updates)) throw new Error('微信资料保存失败')
    const members = await getFamilyMembers(user.id)
    const primary = members.find(member => member.is_primary)
    if (primary) await updateFamilyMember(primary.id, updates)
    await Promise.all([refreshProfile(), refreshMembers(user.id)])
  }

  const finishWechatRegistration = async (phoneCode?: string) => {
    if (!wechatTicket) return
    setLoading(true)
    try {
      const {error} = await registerWechatSignIn(wechatTicket, phoneCode)
      if (error) {
        Taro.showToast({title: error.message || '微信账号创建失败', icon: 'none'})
        return
      }
      await saveWechatProfile()
      completeLoginRedirect()
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '微信登录失败', icon: 'none'})
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneRegistration = (event: any) => {
    const phoneCode = event?.detail?.code
    if (!phoneCode) {
      Taro.showToast({title: '未授权手机号，可选择跳过', icon: 'none'})
      return
    }
    void finishWechatRegistration(phoneCode)
  }

  const handleBindExisting = async () => {
    if (!username.trim() || password.length < 6) {
      Taro.showToast({title: '请输入已有账号和密码', icon: 'none'})
      return
    }
    setLoading(true)
    try {
      const {error: loginError} = await signInWithUsername(username.trim(), password)
      if (loginError) {
        Taro.showToast({title: loginError.message || '已有账号登录失败', icon: 'none'})
        return
      }
      const {error: bindError} = await bindWechatSignIn(wechatTicket)
      if (bindError) {
        await signOut()
        Taro.showToast({title: bindError.message || '微信绑定失败', icon: 'none'})
        return
      }
      completeLoginRedirect()
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
        {isWeApp && wechatStep === 'idle' && (
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

      {wechatStep !== 'idle' && (
        <div className="fixed inset-0 flex flex-col justify-end" style={{zIndex: 1000}}>
          <div
            className="absolute inset-0"
            style={{backgroundColor: 'rgba(0,0,0,0.45)'}}
            onClick={() => !loading && setWechatStep('idle')}
          />
          <div
            className="relative bg-white px-6 pt-3 safe-area-bottom"
            style={{borderRadius: '16px 16px 0 0', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))'}}
          >
            <div className="flex justify-center pb-3">
              <div className="rounded-full" style={{width: '40px', height: '4px', backgroundColor: '#D8D8D8'}} />
            </div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {wechatStep === 'choice' ? '完善微信资料' : '绑定已有账号'}
                </p>
                <p className="text-xl text-muted-foreground mt-1">
                  {wechatStep === 'choice' ? '头像、昵称和手机号均可跳过' : '登录后将微信身份绑定到当前账号'}
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center"
                style={{width: '40px', height: '40px'}}
                onClick={() => !loading && setWechatStep('idle')}
              >
                <div className="i-mdi-close text-2xl text-muted-foreground" />
              </button>
            </div>

            {wechatStep === 'choice' ? (
              <>
                <div className="flex flex-col items-center mb-5">
                  <button
                    type="button"
                    {...({openType: 'chooseAvatar', onChooseAvatar: (event: any) => {
                      const path = event?.detail?.avatarUrl
                      if (path) setWechatAvatarPath(path)
                    }} as any)}
                    className="overflow-hidden border-2 border-primary/30 bg-primary/10 flex items-center justify-center"
                    style={{width: '84px', height: '84px', borderRadius: '50%'}}
                  >
                    {wechatAvatarPath
                      ? <Image src={wechatAvatarPath} mode="aspectFill" style={{width: '84px', height: '84px'}} />
                      : <div className="i-mdi-account text-5xl text-primary" />}
                  </button>
                  <span className="text-xl text-muted-foreground mt-2">选择头像</span>
                </div>
                <div className="border border-input rounded-xl px-4 bg-card mb-4 flex items-center" style={{height: '50px'}}>
                  <input
                    type="nickname"
                    value={wechatNickname}
                    placeholder="填写微信昵称（可跳过）"
                    className="w-full text-xl text-foreground bg-transparent outline-none"
                    onInput={(event) => {
                      const value = (event as any).detail?.value ?? (event as any).target?.value ?? ''
                      setWechatNickname(value)
                    }}
                  />
                </div>
                <button
                  type="button"
                  disabled={loading}
                  className="w-full flex items-center justify-center text-xl font-semibold bg-primary text-white rounded-xl disabled:opacity-50 mb-3"
                  style={{height: '50px'}}
                  onClick={() => void finishWechatRegistration()}
                >{loading ? '登录中...' : '微信快捷登录'}</button>
                <button
                  type="button"
                  disabled={loading}
                  {...({openType: 'getPhoneNumber', onGetPhoneNumber: handlePhoneRegistration} as any)}
                  className="w-full flex items-center justify-center text-xl font-medium border border-primary text-primary rounded-xl disabled:opacity-50 mb-2"
                  style={{height: '48px'}}
                >授权手机号并登录</button>
                <button
                  type="button"
                  className="w-full flex items-center justify-center text-xl text-muted-foreground"
                  style={{height: '42px'}}
                  onClick={() => setWechatStep('bind')}
                >已有账号，去绑定</button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  <div className="border border-input rounded-xl px-4 bg-card flex items-center" style={{height: '50px'}}>
                    <input
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder="已有用户名"
                      value={username}
                      onInput={(e) => { const ev = e as any; setUsername(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                  <div className="border border-input rounded-xl px-4 bg-card flex items-center" style={{height: '50px'}}>
                    <input
                      type="password"
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder="已有账号密码"
                      value={password}
                      onInput={(e) => { const ev = e as any; setPassword(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  className="w-full flex items-center justify-center text-xl font-semibold bg-primary text-white rounded-xl disabled:opacity-50 mb-2"
                  style={{height: '50px'}}
                  onClick={handleBindExisting}
                >{loading ? '绑定中...' : '登录并绑定微信'}</button>
                <button
                  type="button"
                  className="w-full flex items-center justify-center text-xl text-muted-foreground"
                  style={{height: '42px'}}
                  onClick={() => setWechatStep('choice')}
                >返回微信快捷登录</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
