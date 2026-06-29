/**
 * @file Taro应用入口
 */
import type React from 'react'
import type {PropsWithChildren} from 'react'
import {useTabBarPageClass} from '@/hooks/useTabBarPageClass'
import {AuthProvider, useAuth} from '@/contexts/AuthContext'
import {AppProvider} from '@/store/appStore'

import './app.scss'

// 桥接组件：从 AuthContext 获取 userId 后注入 AppProvider
function AppWithUser({children}: PropsWithChildren<unknown>) {
  const {user} = useAuth()
  return (
    <AppProvider userId={user?.id}>
      {children}
    </AppProvider>
  )
}

const App: React.FC = ({children}: PropsWithChildren<unknown>) => {
  useTabBarPageClass()
  return (
    <AuthProvider>
      <AppWithUser>
        {children}
      </AppWithUser>
    </AuthProvider>
  )
}

export default App
