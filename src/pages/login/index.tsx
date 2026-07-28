// @title 登录

import {Image} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {useEffect, useState} from 'react'
import {supabase} from '@/client/supabase'
import {HealthBrandMark} from '@/components/HealthMarks'
import {useAuth} from '@/contexts/AuthContext'
import {getFamilyMembers, updateFamilyMember, updateProfile} from '@/db/api'
import {prepareWechatBinding, uploadWechatAvatar} from '@/services/wechatAuth'
import {useAppStore} from '@/store/appStore'
import {completeLoginRedirect} from '@/utils/authRedirect'
import {EMAIL_OTP_LENGTH, getNewPasswordError} from '@/utils/authValidation'

type WechatStep = 'idle' | 'choice' | 'bind'

export default function LoginPage() {
  const {
    signInWithAccount,
    startEmailSignUp,
    verifyEmailSignUp,
    startWechatSignIn,
    bindWechatSignIn,
    signOut,
    refreshProfile
  } = useAuth()
  const {refreshMembers} = useAppStore()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailOtpSent, setEmailOtpSent] = useState(false)
  const [emailCooldown, setEmailCooldown] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [wechatStep, setWechatStep] = useState<WechatStep>('idle')
  const [wechatTicket, setWechatTicket] = useState('')
  const [wechatNickname, setWechatNickname] = useState('')
  const [wechatAvatarPath, setWechatAvatarPath] = useState('')
  const [wechatSessionReady, setWechatSessionReady] = useState(false)

  const isWeApp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

  useEffect(() => {
    if (emailCooldown <= 0) return
    const timer = setTimeout(() => setEmailCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [emailCooldown])

  const resetEmailVerification = () => {
    setEmailCode('')
    setEmailOtpSent(false)
    setEmailCooldown(0)
  }

  const sendEmailCode = async () => {
    const {error} = await startEmailSignUp(username, password)
    if (error) throw error
    setEmailOtpSent(true)
    setEmailCooldown(60)
    Taro.showToast({title: '验证码已发送，请查收邮箱', icon: 'none', duration: 2500})
  }

  const handleResendEmailCode = async () => {
    if (loading || emailCooldown > 0) return
    setLoading(true)
    try {
      await sendEmailCode()
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '验证码发送失败', icon: 'none'})
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!username.trim()) {
      Taro.showToast({title: '请输入邮箱', icon: 'none'})
      return
    }
    if (password.length < 6) {
      Taro.showToast({title: '密码至少6位', icon: 'none'})
      return
    }
    if (tab === 'register') {
      const passwordError = getNewPasswordError(password)
      if (passwordError) {
        Taro.showToast({title: passwordError, icon: 'none'})
        return
      }
      if (password !== passwordConfirm) {
        Taro.showToast({title: '两次输入的密码不一致', icon: 'none'})
        return
      }
      if (emailOtpSent && emailCode.length !== EMAIL_OTP_LENGTH) {
        Taro.showToast({title: `请输入${EMAIL_OTP_LENGTH}位邮箱验证码`, icon: 'none'})
        return
      }
    }
    if (!agreed) {
      Taro.showToast({title: '请先阅读并同意用户协议', icon: 'none'})
      return
    }
    setLoading(true)
    try {
      if (tab === 'register' && !emailOtpSent) {
        await sendEmailCode()
        return
      }

      const {error} = tab === 'login'
        ? await signInWithAccount(username.trim(), password)
        : await verifyEmailSignUp(username.trim(), emailCode)
      if (error) {
        Taro.showToast({title: error.message || '操作失败', icon: 'none'})
        return
      }
      if (wechatTicket) {
        let bindError: Error | null = null
        try {
          const freshWechatTicket = await prepareWechatBinding()
          const result = await bindWechatSignIn(freshWechatTicket)
          bindError = result.error
        } catch (error) {
          bindError = error as Error
        }
        if (bindError) {
          await signOut()
          Taro.showToast({title: bindError.message || '微信绑定失败', icon: 'none'})
          return
        }
        await saveWechatProfile()
        setWechatTicket('')
      }
      completeLoginRedirect()
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '操作失败', icon: 'none'})
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
        if (data.needsProfile) {
          setWechatSessionReady(true)
          setWechatTicket(data.registrationTicket || '')
          setWechatStep('choice')
        } else {
          completeLoginRedirect()
        }
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

  const handleBindExisting = async () => {
    if (!username.trim() || password.length < 6) {
      Taro.showToast({title: '请输入已有邮箱和密码', icon: 'none'})
      return
    }
    setLoading(true)
    try {
      const {error: loginError} = await signInWithAccount(username.trim(), password)
      if (loginError) {
        Taro.showToast({title: loginError.message || '已有邮箱登录失败', icon: 'none'})
        return
      }
      let bindError: Error | null = null
      try {
        const freshWechatTicket = await prepareWechatBinding()
        const result = await bindWechatSignIn(freshWechatTicket)
        bindError = result.error
      } catch (error) {
        bindError = error as Error
      }
      if (bindError) {
        await signOut()
        Taro.showToast({title: bindError.message || '微信绑定失败', icon: 'none'})
        return
      }
      await saveWechatProfile()
      setWechatTicket('')
      completeLoginRedirect()
    } catch (error) {
      await signOut()
      Taro.showToast({title: error instanceof Error ? error.message : '微信绑定失败', icon: 'none'})
    } finally {
      setLoading(false)
    }
  }

  const changeTab = (nextTab: 'login' | 'register') => {
    setTab(nextTab)
    resetEmailVerification()
  }

  const closeWechatFlow = () => {
    if (loading) return
    if (wechatSessionReady) void signOut()
    setWechatStep('idle')
    setWechatTicket('')
    setWechatNickname('')
    setWechatAvatarPath('')
    setWechatSessionReady(false)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{background: 'var(--gradient-subtle)'}}>
      {/* 顶部品牌区 */}
      <div className="flex flex-col items-center pt-20 pb-10 px-8 bg-gradient-primary">
        <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mb-4">
          <HealthBrandMark size={52} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white">智能健康助手</h1>
        <p className="text-xl text-white/80 mt-2">AI营养秤伴侣应用</p>
      </div>

      {/* 登录卡片 */}
      <div className="flex-1 px-6 pt-8" style={{width: '100%', maxWidth: '560px', margin: '0 auto'}}>
        {/* Tab切换 */}
        <div className="flex bg-secondary rounded-xl p-1 mb-6">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              type="button"
              className={`flex-1 flex items-center justify-center leading-none text-xl font-semibold rounded-lg transition ${tab === t ? 'bg-white text-primary shadow-elegant' : 'text-muted-foreground'}`}
              style={{height: '44px'}}
              onClick={() => changeTab(t)}
            >
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        {/* 表单 */}
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xl text-muted-foreground">
                邮箱
              </p>
              {tab === 'register' && emailOtpSent && (
                <button type="button" className="text-xl text-primary" onClick={resetEmailVerification}>修改注册信息</button>
              )}
            </div>
            <div className={`border-2 border-input rounded-xl px-4 py-3 ${emailOtpSent && tab === 'register' ? 'bg-secondary' : 'bg-card'}`}>
              <input
                className="w-full text-xl text-foreground bg-transparent outline-none"
                type="email"
                disabled={tab === 'register' && emailOtpSent}
                placeholder={tab === 'login' ? '请输入邮箱' : '请输入常用邮箱'}
                value={username}
                onInput={(e) => { const ev = e as any; setUsername(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
          </div>
          <div>
            <p className="text-xl text-muted-foreground mb-2">密码</p>
            <div className={`border-2 border-input rounded-xl px-4 py-3 ${emailOtpSent && tab === 'register' ? 'bg-secondary' : 'bg-card'}`}>
              <input
                type="password"
                maxLength={72}
                disabled={tab === 'register' && emailOtpSent}
                className="w-full text-xl text-foreground bg-transparent outline-none"
                placeholder={tab === 'register' ? '请输入6-72位密码' : '请输入密码'}
                value={password}
                onInput={(e) => { const ev = e as any; setPassword(ev.detail?.value ?? ev.target?.value ?? '') }}
              />
            </div>
          </div>
          {tab === 'register' && (
            <div>
              <p className="text-xl text-muted-foreground mb-2">确认密码</p>
              <div className={`border-2 border-input rounded-xl px-4 py-3 ${emailOtpSent ? 'bg-secondary' : 'bg-card'}`}>
                <input
                  type="password"
                  maxLength={72}
                  disabled={emailOtpSent}
                  className="w-full text-xl text-foreground bg-transparent outline-none"
                  placeholder="请再次输入密码"
                  value={passwordConfirm}
                  onInput={(e) => { const ev = e as any; setPasswordConfirm(ev.detail?.value ?? ev.target?.value ?? '') }}
                />
              </div>
            </div>
          )}
          {tab === 'register' && emailOtpSent && (
            <div>
              <p className="text-xl text-muted-foreground mb-2">邮箱验证码</p>
              <div className="border-2 border-input rounded-xl px-4 bg-card flex items-center" style={{height: '52px'}}>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={EMAIL_OTP_LENGTH}
                  className="flex-1 min-w-0 text-xl text-foreground bg-transparent outline-none"
                  placeholder={`请输入${EMAIL_OTP_LENGTH}位验证码`}
                  value={emailCode}
                  onInput={(e) => {
                    const ev = e as any
                    setEmailCode(String(ev.detail?.value ?? ev.target?.value ?? '').replace(/\D/g, '').slice(0, EMAIL_OTP_LENGTH))
                  }}
                />
                <button
                  type="button"
                  disabled={loading || emailCooldown > 0}
                  className="flex items-center justify-center flex-shrink-0 disabled:opacity-100"
                  style={{
                    width: '116px',
                    height: '36px',
                    marginLeft: '12px',
                    padding: '0 8px',
                    borderRadius: '8px',
                    border: `1px solid ${loading || emailCooldown > 0 ? '#B7C7BC' : '#2F8552'}`,
                    backgroundColor: loading || emailCooldown > 0 ? '#E9F0EB' : '#FFFFFF',
                    color: loading || emailCooldown > 0 ? '#60766A' : '#2F8552',
                    fontSize: '15px',
                    fontWeight: 600,
                    lineHeight: 1,
                    opacity: 1,
                    whiteSpace: 'nowrap'
                  }}
                  onClick={handleResendEmailCode}
                >{loading ? '发送中...' : emailCooldown > 0 ? `${emailCooldown}秒后重发` : '重新发送'}</button>
              </div>
            </div>
          )}
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
          {loading
            ? '处理中...'
            : tab === 'login'
              ? '登录'
              : !emailOtpSent
                ? '获取邮箱验证码'
                : wechatTicket
                  ? '注册并绑定微信'
                  : '验证并注册'}
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
            onClick={closeWechatFlow}
          />
          <div
            className="relative bg-white px-6 pt-3 safe-area-bottom"
            style={{
              borderRadius: '16px 16px 0 0',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
              maxHeight: 'calc(100vh - 24px)',
              overflowY: 'auto'
            }}
          >
            <div className="flex justify-center pb-3">
              <div className="rounded-full" style={{width: '40px', height: '4px', backgroundColor: '#D8D8D8'}} />
            </div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {wechatStep === 'choice' ? '微信快捷登录' : '绑定已有邮箱账户'}
                </p>
                <p className="text-xl text-muted-foreground mt-1">
                  {wechatStep === 'choice' ? '头像和昵称可选，确认后即可进入系统' : '登录后将微信身份绑定到该邮箱账户'}
                </p>
              </div>
              <button
                type="button"
                className="flex items-center justify-center"
                style={{width: '40px', height: '40px'}}
                onClick={closeWechatFlow}
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
                  onClick={async () => {
                    if (loading) return
                    setLoading(true)
                    try {
                      await saveWechatProfile()
                      setWechatStep('idle')
                      setWechatTicket('')
                      setWechatSessionReady(false)
                      completeLoginRedirect()
                    } catch (error) {
                      Taro.showToast({title: error instanceof Error ? error.message : '微信资料保存失败', icon: 'none'})
                    } finally {
                      setLoading(false)
                    }
                  }}
                >{loading ? '进入中...' : '进入系统'}</button>
                <button
                  type="button"
                  className="w-full flex items-center justify-center text-xl font-medium border border-primary text-primary rounded-xl disabled:opacity-50 mb-2"
                  style={{height: '48px'}}
                  onClick={() => setWechatStep('bind')}
                >绑定已有邮箱账户</button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  <div className="border border-input rounded-xl px-4 bg-card flex items-center" style={{height: '50px'}}>
                    <input
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder="已有邮箱"
                      value={username}
                      onInput={(e) => { const ev = e as any; setUsername(ev.detail?.value ?? ev.target?.value ?? '') }}
                    />
                  </div>
                  <div className="border border-input rounded-xl px-4 bg-card flex items-center" style={{height: '50px'}}>
                    <input
                      type="password"
                      className="w-full text-xl text-foreground bg-transparent outline-none"
                      placeholder="邮箱账户密码"
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
