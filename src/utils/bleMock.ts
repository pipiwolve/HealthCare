/**
 * BLE Mock 模块 — v2.2 广播包协议
 * 模拟设备通过广播包上报称重数据，回调签名与 bleService v2.2 完全一致。
 *
 * onWeightUpdate: (weight: number, stable: boolean, unit: WeightUnit)
 */
import type {WeightUnit} from './bleService'

const MOCK_DEVICE_ID = 'mock-scale-001'
const MOCK_DEVICE_NAME = '智能营养秤（演示模式）'

let mockWeightG = 150   // 单位：g
let weightChangeTimer: ReturnType<typeof setInterval> | null = null

let mockCallbacks: {
  onWeightUpdate?: (weight: number, stable: boolean, unit: WeightUnit) => void
  onBatteryUpdate?: (level: number) => void
  onConnectionChange?: (connected: boolean) => void
} = {}

function startWeightSimulation() {
  if (weightChangeTimer) clearInterval(weightChangeTimer)
  let ticks = 0
  weightChangeTimer = setInterval(() => {
    ticks++
    const stable = ticks > 3
    // 前 3 次 ±2g 随机波动，之后稳定；允许负数（去皮后空载会出现负值）
    const noise = stable ? 0 : Math.round((Math.random() - 0.5) * 4)
    const w = parseFloat((mockWeightG + noise).toFixed(0))
    mockCallbacks.onWeightUpdate?.(w, stable, 'g')
  }, 500)
}

function stopWeightSimulation() {
  if (weightChangeTimer) {
    clearInterval(weightChangeTimer)
    weightChangeTimer = null
  }
}

export function mockSetWeight(weight: number) {
  mockWeightG = weight
}

/**
 * BLE Mock 服务 — v2.2，与 bleService 回调接口完全一致
 */
export const bleMockService = {
  deviceId: MOCK_DEVICE_ID,
  deviceName: MOCK_DEVICE_NAME,

  setCallbacks(callbacks: typeof mockCallbacks) {
    mockCallbacks = callbacks
  },

  async init(): Promise<boolean> {
    return true
  },

  async connect(_deviceId?: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 800))
    mockCallbacks.onConnectionChange?.(true)
    startWeightSimulation()
    return true
  },

  async disconnect(): Promise<void> {
    stopWeightSimulation()
    mockCallbacks.onConnectionChange?.(false)
  },

  tare() {
    mockWeightG = 0
    mockCallbacks.onWeightUpdate?.(0, true, 'g')
    return {success: true}
  },

  get isConnected() {
    return true
  },
}
