// @title 添加设备
import {useState, useRef} from 'react'
import Taro from '@tarojs/taro'
import {useAuth} from '@/contexts/AuthContext'
import {withRouteGuard} from '@/components/RouteGuard'
import {upsertDevice} from '@/db/api'
import {bleService} from '@/utils/bleService'
import {useAppStore} from '@/store/appStore'
import type {BLEDevice} from '@/utils/bleService'

type Step = 'type' | 'scan' | 'naming' | 'guide'

const GUIDE_STEPS = [
  {icon: 'i-mdi-scale', title: '放置食材', desc: '将食材放在营养秤的秤盘上'},
  {icon: 'i-mdi-pencil', title: '录入食材名', desc: '输入、语音或拍照识别食材名称'},
  {icon: 'i-mdi-chart-line', title: '开始分析', desc: '点击"综合营养分析"获取AI分析'},
  {icon: 'i-mdi-check-circle', title: '查看结果', desc: '查看营养成分和健康建议'},
]

function DeviceAddPage() {
  const {user} = useAuth()
  const {setBLEStatus: _setBLEStatus} = useAppStore()  // 保留以备后续扩展，此页面不直接使用
  const [step, setStep] = useState<Step>('type')
  const [scanning, setScanning] = useState(false)
  const [foundDevices, setFoundDevices] = useState<BLEDevice[]>([])
  const [scanProgress, setScanProgress] = useState(0)
  const [selectedDevice, setSelectedDevice] = useState<BLEDevice | null>(null)
  const [showWeakDevices, setShowWeakDevices] = useState(false)
  const [deviceName, setDeviceName] = useState('我的营养秤')
  const [guideStep, setGuideStep] = useState(0)
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const startScan = async () => {
    setScanning(true)
    setFoundDevices([])
    setScanProgress(0)

    // 扫描进度
    progressTimer.current = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          stopScan()
          // 扫描结束后触发自动推荐
          setFoundDevices(current => {
            handleScanComplete(current)
            return current
          })
          return 100
        }
        return prev + (100 / 15)
      })
    }, 1000)

    await bleService.startScan((device) => {
      setFoundDevices(prev => {
        if (prev.find(d => d.deviceId === device.deviceId)) return prev
        return [...prev, device]
      })
    }, 15000)
  }

  const stopScan = () => {
    setScanning(false)
    bleService.stopScan()
    if (progressTimer.current) clearInterval(progressTimer.current)
    if (scanTimer.current) clearInterval(scanTimer.current)
  }

  // 扫描完成后自动推荐信号最强设备
  const handleScanComplete = (devices: BLEDevice[]) => {
    if (devices.length === 0) return
    const sorted = [...devices].sort((a, b) => b.RSSI - a.RSSI)
    const best = sorted[0]
    if (best.RSSI > -85) {
      Taro.showModal({
        title: '发现推荐设备',
        content: `检测到最强信号设备「${best.name}」，是否直接连接？`,
        confirmText: '直接连接',
        cancelText: '手动选择',
        success: (res) => {
          if (res.confirm) handleSelectDevice(best)
        }
      })
    }
  }

  const handleSelectDevice = (device: BLEDevice) => {
    setSelectedDevice(device)
    // 绑定阶段：仅停止扫描并记录设备，不启动广播监听
    // 监听由 home 页面 loadData → tryConnectDevice 统一启动，避免与 home 竞态
    stopScan()
    setStep('naming')
  }

  const handleSaveDevice = async () => {
    if (!user || !selectedDevice) return
    await upsertDevice({
      user_id: user.id,
      device_id: selectedDevice.deviceId,
      device_name: deviceName || '我的营养秤',
      device_model: 'AI营养秤',
      service_uuid: null,
      is_connected: true,
      battery_level: 0
    })
    setStep('guide')
  }

  const handleFinishGuide = async () => {
    if (user) {
      const {updateProfile} = await import('@/db/api')
      await updateProfile(user.id, {has_seen_guide: true})
    }
    Taro.switchTab({url: '/pages/home/index'})
  }

  // ===== 设备类型选择 =====
  if (step === 'type') {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <p className="text-2xl font-bold text-foreground mb-2">选择设备类型</p>
        <p className="text-xl text-muted-foreground mb-6">请选择您要添加的设备类型</p>

        <div
          className="bg-card rounded-2xl p-4 shadow-elegant flex items-center gap-4 border-2 border-primary"
          onClick={async () => {
            const ok = await bleService.init()
            if (!ok) {
              Taro.showToast({title: '请开启手机蓝牙后重试', icon: 'none'})
              return
            }
            setStep('scan')
            startScan()
          }}
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <div className="i-mdi-scale text-4xl text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-semibold text-foreground">AI营养秤</p>
            <p className="text-xl text-muted-foreground mt-1">实时称重 + AI营养分析</p>
          </div>
          <div className="w-6 h-6 rounded-full border-2 border-primary bg-primary flex items-center justify-center">
            <div className="i-mdi-check text-xl text-white" />
          </div>
        </div>

        <div className="mt-6 bg-secondary rounded-2xl p-4">
          <p className="text-xl font-medium text-foreground mb-2">配对前请确认</p>
          {['营养秤已开机并显示就绪状态', '营养秤与手机距离在5米以内', '手机蓝牙已开启'].map(tip => (
            <div key={tip} className="flex items-center gap-2 mt-2">
              <div className="i-mdi-check-circle text-xl text-primary" />
              <span className="text-xl text-foreground">{tip}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ===== 扫描步骤 =====
  if (step === 'scan') {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <p className="text-2xl font-bold text-foreground mb-2">扫描附近设备</p>
        <p className="text-xl text-muted-foreground mb-4">请确保营养秤已开机并处于配对模式</p>

        {/* 扫描动画 */}
        {scanning && (
          <div className="flex flex-col items-center py-6">
            <div className="relative w-24 h-24 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-breathe" />
              <div className="absolute inset-2 rounded-full border-4 border-primary/50 animate-breathe" style={{animationDelay: '0.3s'}} />
              <div className="absolute inset-4 rounded-full border-4 border-primary animate-breathe" style={{animationDelay: '0.6s'}} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="i-mdi-bluetooth text-4xl text-primary" />
              </div>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-primary rounded-full transition-all" style={{width: `${scanProgress}%`}} />
            </div>
            <p className="text-xl text-muted-foreground">扫描中... ({Math.round(scanProgress/100*15)}s/15s)</p>
          </div>
        )}

        {/* 设备列表：按 RSSI 强度排序，弱信号（<= -85dBm）默认折叠 */}
        <div className="flex flex-col gap-3 mb-4">
          {foundDevices.length === 0 && !scanning ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="i-mdi-bluetooth-off text-5xl text-muted-foreground" />
              <p className="text-xl text-muted-foreground">未发现设备</p>
              <div className="bg-secondary rounded-xl p-4 w-full">
                <p className="text-xl font-medium text-foreground mb-2">排查建议</p>
                {['确认营养秤已开机', '检查设备是否超出蓝牙范围（5m以内）', '重新开关营养秤后再次扫描'].map(tip => (
                  <p key={tip} className="text-xl text-muted-foreground mt-1">· {tip}</p>
                ))}
              </div>
            </div>
          ) : (() => {
            const sorted = [...foundDevices].sort((a, b) => b.RSSI - a.RSSI)
            const strongDevices = sorted.filter(d => d.RSSI > -85)
            const weakDevices = sorted.filter(d => d.RSSI <= -85)
            const renderDevice = (device: BLEDevice) => (
              <div
                key={device.deviceId}
                className="bg-card rounded-2xl p-4 shadow-elegant flex items-center gap-3"
                onClick={() => handleSelectDevice(device)}
              >
                <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center flex-shrink-0">
                  <div className="i-mdi-scale text-2xl text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xl font-medium text-foreground">{device.name}</p>
                  <p className="text-xl text-muted-foreground">
                    信号强度：{device.RSSI > -60 ? '强' : device.RSSI > -80 ? '中' : '弱'}
                  </p>
                </div>
                <div className="i-mdi-bluetooth-connect text-2xl text-primary" />
              </div>
            )
            return (
              <>
                {strongDevices.map(renderDevice)}
                {weakDevices.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="flex items-center justify-center leading-none gap-1 text-xl text-muted-foreground py-2"
                      onClick={() => setShowWeakDevices(v => !v)}
                    >
                      <div className={`i-mdi-chevron-${showWeakDevices ? 'up' : 'down'} text-2xl`} />
                      <span>{showWeakDevices ? '收起' : `显示 ${weakDevices.length} 个信号弱的设备`}</span>
                    </button>
                    {showWeakDevices && weakDevices.map(renderDevice)}
                  </>
                )}
              </>
            )
          })()}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 flex items-center justify-center leading-none text-xl font-medium border-2 border-primary text-primary rounded-xl"
            style={{height: '48px'}}
            onClick={() => Taro.navigateBack()}
          >返回</button>
          {!scanning ? (
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl"
              style={{height: '48px'}}
              onClick={() => { setFoundDevices([]); startScan() }}
            >
              <div className="i-mdi-refresh text-xl" />
              <span>重新扫描</span>
            </button>
          ) : (
            <button
              type="button"
              className="flex-1 flex items-center justify-center leading-none text-xl font-medium border-2 border-primary text-primary rounded-xl"
              style={{height: '48px'}}
              onClick={stopScan}
            >停止扫描</button>
          )}
        </div>
      </div>
    )
  }

  // ===== 设备命名 =====
  if (step === 'naming') {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-4">
            <div className="i-mdi-scale text-5xl text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">设备配对成功</p>
          <p className="text-xl text-muted-foreground mt-1">为您的营养秤取个名字</p>
        </div>

        <p className="text-xl text-muted-foreground mb-2">设备名称</p>
        <div className="border-2 border-input rounded-xl px-4 py-3 bg-card mb-6">
          <input
            className="w-full text-xl text-foreground bg-transparent outline-none"
            placeholder="我的营养秤"
            value={deviceName}
            onInput={(e) => { const ev = e as any; setDeviceName(ev.detail?.value ?? ev.target?.value ?? '') }}
          />
        </div>

        <button
          type="button"
          className="w-full flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl shadow-elegant"
          style={{height: '52px'}}
          onClick={handleSaveDevice}
        >
          <div className="i-mdi-check text-2xl" />
          <span>完成设置</span>
        </button>
      </div>
    )
  }

  // ===== 新手引导 =====
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-20 h-20 bg-gradient-primary rounded-3xl flex items-center justify-center mb-6 shadow-elegant">
          <div className={`${GUIDE_STEPS[guideStep].icon} text-5xl text-white`} />
        </div>

        <div className="flex gap-2 mb-6">
          {GUIDE_STEPS.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all ${i === guideStep ? 'w-8 bg-primary' : 'w-2 bg-border'}`} />
          ))}
        </div>

        <p className="text-3xl font-bold text-foreground mb-3">
          步骤 {guideStep + 1}：{GUIDE_STEPS[guideStep].title}
        </p>
        <p className="text-xl text-muted-foreground text-center leading-relaxed px-4">
          {GUIDE_STEPS[guideStep].desc}
        </p>
      </div>

      <div className="px-6 pb-10 flex gap-3">
        <button
          type="button"
          className="flex items-center justify-center leading-none text-xl font-medium border-2 border-primary text-primary rounded-xl px-6"
          style={{height: '52px'}}
          onClick={handleFinishGuide}
        >跳过</button>
        <button
          type="button"
          className="flex-1 flex items-center justify-center leading-none gap-2 text-xl font-semibold bg-gradient-primary text-white rounded-xl shadow-elegant"
          style={{height: '52px'}}
          onClick={() => {
            if (guideStep < GUIDE_STEPS.length - 1) {
              setGuideStep(guideStep + 1)
            } else {
              handleFinishGuide()
            }
          }}
        >
          {guideStep < GUIDE_STEPS.length - 1 ? '下一步' : '开始使用'}
          <div className="i-mdi-arrow-right text-2xl" />
        </button>
      </div>
    </div>
  )
}

export default withRouteGuard(DeviceAddPage)
