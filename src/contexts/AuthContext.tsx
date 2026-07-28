import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react'
import {supabase} from '@/client/supabase'
import type {User} from '@supabase/supabase-js'
import type {Profile} from '@/db/types'
import {normalizeEmail, normalizeRegistrationEmail, validateEmailOtp, validateNewPassword} from '@/utils/authValidation'
import {
  bindWechatAccount,
  startWechatLogin,
  type WechatStartResult
} from '@/services/wechatAuth'

export async function getProfile(userId: string): Promise<Profile | null> {
  const {data, error} = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

  if (error) {
    console.error('Failed to fetch user profile:', error)
    return null
  }
  return data
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signInWithAccount: (account: string, password: string) => Promise<{error: Error | null}>
  startEmailSignUp: (email: string, password: string) => Promise<{error: Error | null}>
  verifyEmailSignUp: (email: string, code: string) => Promise<{error: Error | null}>
  signUpWithPhone: (phone: string, password: string) => Promise<{error: Error | null}>
  signInWithPhone: (phone: string) => Promise<{error: Error | null}>
  verifyPhoneOtp: (phone: string, code: string) => Promise<{error: Error | null}>
  startWechatSignIn: () => Promise<{data: WechatStartResult | null; error: Error | null}>
  bindWechatSignIn: (ticket: string) => Promise<{error: Error | null}>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase()
  if (!/^[A-Za-z0-9_]{3,32}$/.test(normalized)) throw new Error('用户名需为3-32位字母、数字或下划线')
  return normalized
}

export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      return
    }

    const profileData = await getProfile(user.id)
    setProfile(profileData)
  }, [user])

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({data: {session}}) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          getProfile(session.user.id).then(setProfile)
        }
        setLoading(false)
      })
      .catch((error) => {
        console.warn('Failed to get session:', error)
        setUser(null)
        setProfile(null)
        setLoading(false)
      })

    // In this function, do NOT use any await calls. Use `.then()` instead to avoid deadlocks.
    const {
      data: {subscription}
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        getProfile(session.user.id).then(setProfile)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signInWithAccount = async (account: string, password: string) => {
    try {
      const email = account.includes('@')
        ? normalizeEmail(account)
        : `${normalizeUsername(account)}@miaoda.com`
      const {error} = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signUpWithPhone = async (phone: string, password: string) => {
    try {
      validateNewPassword(password)
      const {error} = await supabase.auth.signUp({
        phone,
        password
      })

      if (error) throw error
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const startEmailSignUp = async (email: string, password: string) => {
    try {
      const normalizedEmail = normalizeRegistrationEmail(email)
      validateNewPassword(password)
      const {data, error} = await supabase.auth.signUp({
        email: normalizedEmail,
        password
      })
      if (error) throw error
      if (data.session) {
        await supabase.auth.signOut()
        throw new Error('邮箱确认尚未启用，请联系管理员完成认证配置')
      }
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const verifyEmailSignUp = async (email: string, code: string) => {
    try {
      const normalizedEmail = normalizeRegistrationEmail(email)
      validateEmailOtp(code)

      const {error: verifyError} = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: code,
        type: 'signup'
      })
      if (verifyError) throw verifyError
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signInWithPhone = async (phone: string) => {
    try {
      const {error} = await supabase.auth.signInWithOtp({phone})

      if (error) throw error
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const verifyPhoneOtp = async (phone: string, code: string) => {
    try {
      const {error} = await supabase.auth.verifyOtp({
        phone,
        token: code,
        type: 'sms'
      })
      if (error) throw error
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const startWechatSignIn = async () => {
    try {
      return {data: await startWechatLogin(), error: null}
    } catch (error) {
      return {data: null, error: error as Error}
    }
  }

  const bindWechatSignIn = async (ticket: string) => {
    try {
      await bindWechatAccount(ticket)
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithAccount,
        startEmailSignUp,
        verifyEmailSignUp,
        signUpWithPhone,
        signInWithPhone,
        verifyPhoneOtp,
        startWechatSignIn,
        bindWechatSignIn,
        signOut,
        refreshProfile
      }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
