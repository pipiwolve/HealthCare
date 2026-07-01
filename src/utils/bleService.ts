// BLE蓝牙服务 — v2.2 广播包协议落地实现
//
// 协议来源：《厨房秤广播协议0612》PDF
// 设备通过 BLE 广播包持续上报数据，无需建立 GATT 连接。
//
// 广播包示例：02 01 04 | 07 FF B0 7C 00 00 CE 01 | 04 09 42 61 69
//                [Flags]  [AD Type 0xFF 厂商数据]   [设备名 "Bai"]
//
// 厂商自定义数据 Value（6字节）：
//   [0] 版本号   0xB0（厂商识别码，非此值则忽略）
//   [1] 流水号   从1递增，不稳定时持续变化（保留，暂不去重）
//   [2-4] 重量原始值 Uint24 大端
//   [5] 消息体属性位域：
//       Bit7    符号位（0=正数, 1=负数）
//       Bit6-4  单位（000=g, 001=lb, 010=oz, 011=ml）
//       Bit3-1  小数位数（000=0位, 001=1位, 010=2位）
//       Bit0    稳定状态（0=不稳定, 1=稳定）
//
// 重量计算：weight = weightRaw / 10^decimals，负数取反
import Taro from '@tarojs/taro'
import {isPrivacyScopeError, showPrivacyScopeDeclarationTip} from './wechatPrivacy'

// ─── 重量单位 ─────────────────────────────────────────────────────────────────
export type WeightUnit = 'g' | 'lb' | 'oz' | 'ml'

const UNIT_MAP: Record<number, WeightUnit> = {0: 'g', 1: 'lb', 2: 'oz', 3: 'ml'}

// ─── 设备扫描结果 ─────────────────────────────────────────────────────────────
export interface BLEDevice {
  deviceId: string
  name: string
  RSSI: number
}

// 心跳超时：超过此时间无有效包则标记为已断开
const HEARTBEAT_TIMEOUT_MS = 5000

class BLEService {
  private isInitialized = false
  private initPromise: Promise<boolean> | null = null

  // 回调
  private onWeightUpdate?: (weight: number, stable: boolean, unit: WeightUnit) => void
  private onConnectionChange?: (connected: boolean) => void
  private onDeviceNameUpdate?: (name: string) => void

  // 监听状态
  private listeningDeviceId: string | null = null
  private lastDataTime = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private isConnectedState = false
  private reportedDeviceName = ''

  setCallbacks(callbacks: {
    onWeightUpdate?: (weight: number, stable: boolean, unit: WeightUnit) => void
    // onBatteryUpdate 接口预留以兼容调用方，v2.2协议不含电量字段，不存储不触发
    onBatteryUpdate?: (level: number) => void
    onConnectionChange?: (connected: boolean) => void
    onDeviceNameUpdate?: (name: string) => void
  }) {
    this.onWeightUpdate = callbacks.onWeightUpdate
    this.onConnectionChange = callbacks.onConnectionChange
    this.onDeviceNameUpdate = callbacks.onDeviceNameUpdate
    // callbacks.onBatteryUpdate 接收后不存储：v2.2协议广播包无电量字段
    //
    // 修复1：如果当前已在接收状态，立即通知新回调
    // 场景：从 device-manager 探测页返回 home 时，home 重注册了新回调，
    // 但 isConnectedState 已为 true，decodeManufacturerPayload 里的
    // if (!this.isConnectedState) 条件永远为 false，onConnectionChange(true) 不再触发。
    // 在此处补发，确保新回调立即同步到当前连接状态。
    if (this.isConnectedState && callbacks.onConnectionChange) {
      callbacks.onConnectionChange(true)
    }
    // 如果已有设备名，立即通知
    if (this.reportedDeviceName && callbacks.onDeviceNameUpdate) {
      callbacks.onDeviceNameUpdate(this.reportedDeviceName)
    }
  }

  // ─── 初始化蓝牙适配器 ───────────────────────────────────────────────────────
  async init(): Promise<boolean> {
    if (this.isInitialized) return true
    if (this.initPromise) return this.initPromise
    this.initPromise = new Promise(resolve => {
      Taro.openBluetoothAdapter({
        success: () => {
          this.isInitialized = true
          this.initPromise = null
          resolve(true)
        },
        fail: (err) => {
          const errMsg = err?.errMsg || ''
          if (errMsg.includes('already opened')) {
            this.isInitialized = true
            this.initPromise = null
            resolve(true)
            return
          }
          if (isPrivacyScopeError(err)) {
            console.warn('[BLE] 隐私协议未声明蓝牙接口:', err)
            showPrivacyScopeDeclarationTip('蓝牙')
            this.isInitialized = false
            this.initPromise = null
            resolve(false)
            return
          }
          console.warn('[BLE] 适配器初始化失败:', err)
          this.isInitialized = false
          this.initPromise = null
          resolve(false)
        }
      })
    })
    return this.initPromise
  }

  // ─── 扫描设备（用于添加设备时发现列表，allowDuplicatesKey:false）──────────────
  // 问题6修复：扫描前 close+open 适配器，清除系统缓存，提升首次发现成功率
  async startScan(onFound: (device: BLEDevice) => void, timeout = 15000): Promise<void> {
    // 关闭并重新打开蓝牙适配器，清除上次扫描缓存的设备列表
    await new Promise<void>(resolve => {
      Taro.closeBluetoothAdapter({complete: () => resolve()})
    })
    this.isInitialized = false

    const ok = await this.init()
    if (!ok) return
    const found = new Set<string>()

    Taro.onBluetoothDeviceFound(({devices}) => {
      for (const d of devices) {
        if (!d.deviceId || found.has(d.deviceId)) continue
        found.add(d.deviceId)
        onFound({
          deviceId: d.deviceId,
          name: d.name || (d as any).localName || '未知设备',
          RSSI: d.RSSI || -100
        })
      }
    })

    await new Promise<void>((resolve, reject) => {
      Taro.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
        success: () => resolve(),
        fail: reject
      })
    })

    setTimeout(() => this.stopScan(), timeout)
  }

  stopScan() {
    Taro.stopBluetoothDevicesDiscovery({})
  }

  // ─── 开始监听设备广播包（替代 GATT 连接，无需 createBLEConnection）──────────
  // connect() 是 startListening() 的别名，保持对已有调用方的兼容
  async connect(deviceId: string): Promise<boolean> {
    return this.startListening(deviceId)
  }

  async startListening(deviceId: string): Promise<boolean> {
    const ok = await this.init()
    if (!ok) return false

    // 停止之前的监听（如有）
    this.stopListeningInternal(false)
    this.listeningDeviceId = deviceId
    this.lastDataTime = 0

    // 修复1：await stop，确保旧扫描完全停止后再注册回调和启动新扫描
    await new Promise<void>(resolve => {
      Taro.stopBluetoothDevicesDiscovery({complete: () => resolve()})
    })

    // 修复3：deviceId 过滤 + 设备名备用匹配（防 MAC 随机化/平台格式差异）
    Taro.onBluetoothDeviceFound(({devices}) => {
      const targetId = this.listeningDeviceId
      if (!targetId) return
      for (const d of devices) {
        const nameMatch = d.name === 'Bai' || (d as any).localName === 'Bai'
        if (d.deviceId !== targetId && !nameMatch) continue
        // 上报设备名：优先 localName（广播中的完整名称），次选 name
        const realName = (d as any).localName || d.name || ''
        if (realName && realName !== this.reportedDeviceName) {
          this.reportedDeviceName = realName
          this.onDeviceNameUpdate?.(realName)
        }
        const advData = (d as any).advertisData as ArrayBuffer | undefined
        if (advData) this.parseManufacturerData(advData)
      }
    })

    // 修复1：await start，确认扫描已成功启动后再返回
    const started = await new Promise<boolean>(resolve => {
      Taro.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: true,  // 必须为 true，才能持续接收同一设备广播
        success: () => {
          console.log('[BLE] 广播监听已启动，目标:', deviceId)
          resolve(true)
        },
        fail: (err) => {
          console.warn('[BLE] 广播监听启动失败:', err)
          resolve(false)
        }
      })
    })

    if (started) this.startHeartbeat()
    return started
  }

  // ─── 停止监听 ────────────────────────────────────────────────────────────────
  private stopListeningInternal(notifyDisconnect: boolean) {
    this.listeningDeviceId = null
    this.stopHeartbeat()
    if (notifyDisconnect && this.isConnectedState) {
      this.isConnectedState = false
      this.onConnectionChange?.(false)
    }
  }

  async disconnect(): Promise<void> {
    this.stopListeningInternal(true)
    Taro.stopBluetoothDevicesDiscovery({})
  }

  // ─── 心跳检测 ────────────────────────────────────────────────────────────────
  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.lastDataTime === 0) return  // 还未收到过任何包，等待中
      if (Date.now() - this.lastDataTime > HEARTBEAT_TIMEOUT_MS) {
        if (this.isConnectedState) {
          console.warn('[BLE] 心跳超时，标记为断开')
          this.isConnectedState = false
          this.onConnectionChange?.(false)
        }
      }
    }, 2000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  // ─── 解析广播包中的厂商自定义数据 ────────────────────────────────────────────
  //
  // 修复2：双路径解析，兼容不同平台的 advertisData 格式：
  //   快速路径：首字节=0xB0，说明平台已剥离 AD 头，直接当 6 字节 payload 处理
  //   标准路径：遍历完整 AD Structure，找到 type=0xFF 且 value[0]=0xB0 的段
  private parseManufacturerData(advData: ArrayBuffer) {
    const raw = new Uint8Array(advData)
    if (raw.length === 0) return

    // 快速路径：某些平台 advertisData 已剥离 AD 头，直接给厂商 value（首字节=0xB0）
    if (raw.length >= 6 && raw[0] === 0xB0) {
      this.decodeManufacturerPayload(raw, 0)
      return
    }

    // 标准路径：遍历 AD Structure，每段格式：[len(1B)][type(1B)][value(len-1 B)]
    let i = 0
    while (i < raw.length) {
      const len = raw[i]
      if (len === 0 || i + len >= raw.length) break
      const type     = raw[i + 1]
      const valueStart = i + 2
      const valueLen = len - 1  // len 包含 type 字节
      if (type === 0xFF && valueLen >= 6 && raw[valueStart] === 0xB0) {
        this.decodeManufacturerPayload(raw, valueStart)
        return
      }
      i += 1 + len
    }
  }

  // ─── 解码6字节厂商数据负载 ───────────────────────────────────────────────────
  //   offset+0  版本号（0xB0，已由调用方校验）
  //   offset+1  流水号（保留，暂不使用）
  //   offset+2~4  重量原始值 Uint24 大端
  //   offset+5  消息体属性位域
  private decodeManufacturerPayload(data: Uint8Array, offset: number) {
    const weightRaw = (data[offset + 2] << 16) | (data[offset + 3] << 8) | data[offset + 4]
    const attr      = data[offset + 5]
    const negative  = (attr >> 7) & 1
    const unitCode  = (attr >> 4) & 0x07
    const decimals  = (attr >> 1) & 0x07
    const stable    = (attr & 0x01) === 1

    let weight = weightRaw / Math.pow(10, decimals)
    if (negative) weight = -weight
    weight = parseFloat(weight.toFixed(decimals))

    const unit: WeightUnit = UNIT_MAP[unitCode] ?? 'g'

    this.lastDataTime = Date.now()
    if (!this.isConnectedState) {
      this.isConnectedState = true
      this.onConnectionChange?.(true)
      console.log('[BLE] 首次收到有效广播包，标记为已连接')
    }
    this.onWeightUpdate?.(weight, stable, unit)
  }

  get isConnected() {
    return this.isConnectedState
  }

  // 是否正在监听广播（listeningDeviceId 非空即表示扫描已启动）
  get isListening() {
    return this.listeningDeviceId !== null
  }
}

export const bleService = new BLEService()
