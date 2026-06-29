// @title 个人中心
import {useCallback, useEffect, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {Image} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {useAppStore} from '@/store/appStore'
import {withRouteGuard} from '@/components/RouteGuard'
import {getDevices} from '@/db/api'
import {getAvatarByGender} from '@/utils/avatarUtils'
import type {Device} from '@/db/types'

function ProfilePage() {
  const {user, profile, signOut} = useAuth()
  const {activeMember, familyMembers, bleStatus, connectedDevice, batteryLevel} = useAppStore()
  const [devices, setDevices] = useState<Device[]>([])

  const loadData = useCallback(async () => {
    if (!user) return
    const devicesData = await getDevices(user.id)
    setDevices(devicesData)
  }, [user])

  useEffect(() => { loadData() }, [loadData])
  useDidShow(() => { loadData() })

  const handleSignOut = async () => {
    const {confirm} = await new Promise<{confirm: boolean}>(resolve => {
      Taro.showModal({
        title: '退出登录',
        content: '确认退出当前账号吗？',
        success: (res) => resolve({confirm: res.confirm})
      })
    })
    if (confirm) {
      await signOut()
      Taro.reLaunch({url: '/pages/login/index'})
    }
  }

  const menuItems = [
    {icon: 'i-mdi-bluetooth', label: '设备管理', desc: `${devices.length}台设备`, url: '/pages/device-manager/index'},
    {icon: 'i-mdi-account-edit', label: '个人资料', desc: activeMember?.nickname || '未设置', url: '/pages/personal-info/index'},
    {icon: 'i-mdi-account-group', label: '家庭成员', desc: familyMembers.length > 0 ? `${familyMembers.length}位成员` : '未配置', url: '/pages/family/index'},
    {icon: 'i-mdi-bell-outline', label: '提醒设置', desc: '餐前&饮水提醒', url: '/pages/reminder-settings/index'},
    {icon: 'i-mdi-help-circle-outline', label: '使用帮助', desc: '使用指引', url: '/pages/device-add/index'},
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* 用户信息卡片 — pt-12 确保顶部与系统导航栏胶囊按钮不重叠 */}
      <div className="bg-gradient-primary px-6 pt-12 pb-6">
        <div
          className="flex items-center gap-4"
          onClick={() => Taro.navigateTo({url: '/pages/personal-info/index'})}
        >
          {/* 头像 — 圆形头像框，按当前成员性别动态显示卡通头像 */}
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)'}}
          >
            <Image
              src={getAvatarByGender(activeMember?.gender)}
              mode="aspectFill"
              style={{width: '80px', height: '80px'}}
            />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-white">{(profile?.nickname as string) || (profile?.username as string) || '健康用户'}</p>
            {activeMember && (
              <p className="text-xl text-white/80 mt-1">当前：{activeMember.nickname}</p>
            )}
            <p className="text-xl text-white/60 mt-1">点击完善健康档案</p>
          </div>
          <div className="i-mdi-chevron-right text-2xl text-white/60" />
        </div>
      </div>

      {/* 设备状态卡片 — 紧跟绿色 header 正下方，不用负边距，确保完整可见 */}
      <div className="px-4 mt-3 mb-3">
        <div
          className="bg-card rounded-2xl p-4 shadow-elegant"
          onClick={() => Taro.navigateTo({url: '/pages/device-manager/index'})}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bleStatus === 'connected' ? 'bg-primary/10' : 'bg-secondary'}`}>
                <div className={`i-mdi-bluetooth text-2xl ${bleStatus === 'connected' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="text-xl font-medium text-foreground">
                  {bleStatus === 'connected' ? connectedDevice?.device_name || '营养秤' : '未连接设备'}
                </p>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${bleStatus === 'connected' ? 'bg-primary' : 'bg-muted-foreground'}`} />
                  <span className="text-xl text-muted-foreground">
                    {bleStatus === 'connected' ? `已连接${batteryLevel > 0 ? ` · 电量${batteryLevel}%` : ''}` : '点击管理设备'}
                  </span>
                </div>
              </div>
            </div>
            <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* 菜单列表 */}
      <div className="px-4 pb-tabbar flex flex-col gap-2">
        <div className="bg-card rounded-2xl shadow-elegant overflow-hidden">
          {menuItems.map((item, idx) => (
            <div
              key={item.label}
              className={`flex items-center gap-4 px-4 py-4 ${idx < menuItems.length - 1 ? 'border-b border-border' : ''}`}
              onClick={() => Taro.navigateTo({url: item.url})}
            >
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <div className={`${item.icon} text-2xl text-primary`} />
              </div>
              <div className="flex-1">
                <p className="text-xl font-medium text-foreground">{item.label}</p>
                <p className="text-xl text-muted-foreground">{item.desc}</p>
              </div>
              <div className="i-mdi-chevron-right text-2xl text-muted-foreground" />
            </div>
          ))}
        </div>

        {/* 退出登录 */}
        <button
          type="button"
          className="w-full flex items-center justify-center leading-none gap-2 text-xl font-medium text-destructive border-2 border-destructive/30 bg-destructive/5 rounded-2xl mt-2"
          style={{height: '52px'}}
          onClick={handleSignOut}
        >
          <div className="i-mdi-logout text-2xl" />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  )
}

export default withRouteGuard(ProfilePage)
