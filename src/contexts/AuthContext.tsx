import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react'
import {supabase} from '@/client/supabase'
import type {User} from '@supabase/supabase-js'
import type {Profile} from '@/db/types'
import {
  bindWechatAccount,
  registerWechatAccount,
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
  signInWithUsername: (username: string, password: string) => Promise<{error: Error | null}>
  signUpWithUsername: (username: string, password: string) => Promise<{error: Error | null}>
  signUpWithPhone: (phone: string, password: string) => Promise<{error: Error | null}>
  signInWithPhone: (phone: string) => Promise<{error: Error | null}>
  verifyPhoneOtp: (phone: string, code: string) => Promise<{error: Error | null}>
  startWechatSignIn: () => Promise<{data: WechatStartResult | null; error: Error | null}>
  registerWechatSignIn: (ticket: string, phoneCode?: string) => Promise<{error: Error | null}>
  bindWechatSignIn: (ticket: string) => Promise<{error: Error | null}>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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

  const signInWithUsername = async (username: string, password: string) => {
    try {
      const email = `${username}@miaoda.com`
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

  const signUpWithUsername = async (username: string, password: string) => {
    try {
      const email = `${username}@miaoda.com`
      const {error} = await supabase.auth.signUp({
        email,
        password,
        options: {data: {username}}
      })

      if (error) throw error
      return {error: null}
    } catch (error) {
      return {error: error as Error}
    }
  }

  const signUpWithPhone = async (phone: string, password: string) => {
    try {
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

  const registerWechatSignIn = async (ticket: string, phoneCode?: string) => {
    try {
      await registerWechatAccount(ticket, phoneCode)
      return {error: null}
    } catch (error) {
      return {error: error as Error}
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
        signInWithUsername,
        signUpWithUsername,
        signUpWithPhone,
        signInWithPhone,
        verifyPhoneOtp,
        startWechatSignIn,
        registerWechatSignIn,
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
