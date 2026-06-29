// @title 设备管理
import {useState, useCallback, useEffect} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useAuth} from '@/contexts/AuthContext'
import {useAppStore} from '@/store/appStore'
import {withRouteGuard} from '@/components/RouteGuard'
import {getDevices, deleteDevice} from '@/db/api'
import {bleService} from '@/utils/bleService'
import type {Device} from '@/db/types'

// 在线探测：启动扫描 N 毫秒后停止，检查期间是否收到该设备广播
const PROBE_TIMEOUT_MS = 5000

function DeviceManagerPage() {
  const {user} = useAuth()
  const {connectedDevice, setConnectedDevice, setBLEStatus} = useAppStore()
  const [devices, setDevices] = useState<Device[]>([])
  // deviceId → 'online' | 'offline' | 'probing'
  const [onlineStatus, setOnlineStatus] = useState<Record<string, 'online' | 'offline' | 'probing'>>({})

  const loadDevices = useCallback(async () => {
    if (!user) return
    const data = await getDevices(user.id)
    setDevices(data)
  }, [user])

  useEffect(() => { loadDevices() }, [loadDevices])
  useDidShow(() => { loadDevices() })

  // 对指定设备发起 5 秒广播探测，判断在线/离线
  const probeDevice = useCallback(async (device: Device) => {
    setOnlineStatus(prev => ({...prev, [device.device_id]: 'probing'}))

    let heard = false

    bleService.setCallbacks({
      onWeightUpdate: () => { heard = true },
      onConnectionChange: () => {},
    })

    const ok = await bleService.init()
    if (ok) {
      await bleService.startListening(device.device_id)
      await new Promise<void>(resolve => setTimeout(resolve, PROBE_TIMEOUT_MS))
    }

    // 修复2：探测结束后停止监听，清理副作用
    // 让首页 useDidShow 返回时能检测到 !isListening，重新走完整 tryConnectDevice 流程
    await bleService.disconnect()

    setOnlineStatus(prev => ({...prev, [device.device_id]: heard ? 'online' : 'offline'}))
  }, [])

  const handleUnbind = async (device: Device) => {
    const {confirm} = await new Promise<{confirm: boolean}>(resolve => {
      Taro.showModal({
        title: '解绑设备',
        content: `确认解绑「${device.device_name}」？解绑后需重新配对。`,
        confirmColor: '#D9534F',
        success: (res) => resolve({confirm: res.confirm})
      })
    })
    if (!confirm) return
    if (connectedDevice?.id === device.id) {
      await bleService.disconnect()
      setBLEStatus('disconnected')
      setConnectedDevice(null)
    }
    await deleteDevice(device.id)
    loadDevices()
    Taro.showToast({title: '设备已解绑', icon: 'success'})
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 添加设备按钮 */}
      <div className="px-4 py-4">
        <button
          type="button"
          className="w-full flex items-center justify-center leading-none gap-3 text-xl font-semibold bg-gradient-primary text-white rounded-2xl shadow-elegant"
          style={{height: '52px'}}
          onClick={() => Taro.navigateTo({url: '/pages/device-add/index'})}
        >
          <div className="i-mdi-bluetooth-plus text-2xl" />
          <span>添加新设备</span>
        </button>
      </div>

      {/* 设备列表 */}
      <div className="px-4 flex flex-col gap-3">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-20 h-20 bg-secondary rounded-3xl flex items-center justify-center">
              <div className="i-mdi-scale text-5xl text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold text-foreground">暂无绑定设备</p>
            <p className="text-xl text-muted-foreground text-center">点击上方按钮，开始配对AI营养秤</p>
          </div>
        ) : devices.map(device => {
          const status = onlineStatus[device.device_id]
          const isOnline = status === 'online'
          const isProbing = status === 'probing'

          return (
            <div key={device.id} className="bg-card rounded-2xl shadow-elegant p-4">
              <div className="flex items-center gap-4">
                {/* 设备图标 */}
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isOnline ? 'bg-primary/10' : 'bg-secondary'}`}>
                  <div className={`i-mdi-scale text-2xl ${isOnline ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                {/* 设备信息 */}
                <div className="flex-1">
                  <p className="text-xl font-semibold text-foreground">{device.device_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {isProbing ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-warning animate-breathe flex-shrink-0" />
                        <span className="text-xl text-muted-foreground">探测中...</span>
                      </>
                    ) : status ? (
                      <>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-primary' : 'bg-muted-foreground'}`} />
                        <span className="text-xl text-muted-foreground">{isOnline ? '在线' : '离线'}</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-muted-foreground" />
                        <span className="text-xl text-muted-foreground">未探测</span>
                      </>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                  {/* 探测在线状态 */}
                  <button
                    type="button"
                    className={`flex items-center justify-center leading-none text-xl font-medium rounded-xl border-2 px-3 transition ${isProbing ? 'border-primary/40 text-primary/40' : 'border-primary text-primary'}`}
                    style={{height: '40px'}}
                    onClick={() => !isProbing && probeDevice(device)}
                  >
                    <div className={`i-mdi-radar text-xl ${isProbing ? 'animate-breathe' : ''}`} />
                  </button>
                  {/* 解绑 */}
                  <button
                    type="button"
                    className="flex items-center justify-center leading-none text-xl font-medium border-2 border-destructive/30 text-destructive rounded-xl px-3"
                    style={{height: '40px'}}
                    onClick={() => handleUnbind(device)}
                  >解绑</button>
                </div>
              </div>

              {/* 设备 ID 小字 */}
              <p className="text-xl text-muted-foreground mt-2 truncate">ID: {device.device_id}</p>
            </div>
          )
        })}
      </div>

      {/* 说明文字 */}
      <div className="px-4 py-6">
        <p className="text-xl text-muted-foreground text-center">
          点击雷达图标可探测设备是否在线
        </p>
      </div>
    </div>
  )
}

export default withRouteGuard(DeviceManagerPage)
