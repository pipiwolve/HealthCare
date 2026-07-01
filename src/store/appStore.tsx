// 全局应用状态 - 使用 React Context 管理
import {createContext, useContext, useState, useEffect, useCallback, type ReactNode} from 'react'
import Taro from '@tarojs/taro'
import type {FamilyMember, Device, Ingredient} from '@/db/types'
import {getFamilyMembers, getActiveMemberId, setActiveMember} from '@/db/api'
import type {WeightUnit} from '@/utils/bleService'

// BLE连接状态
export type BLEStatus = 'connected' | 'disconnected' | 'connecting'

export interface AppState {
  // 当前家庭成员
  activeMember: FamilyMember | null
  familyMembers: FamilyMember[]
  // 设备状态
  bleStatus: BLEStatus
  connectedDevice: Device | null
  batteryLevel: number
  // 当前重量
  currentWeight: number
  weightUnit: WeightUnit
  isWeightStable: boolean
  hasTare: boolean
  // 当前食材列表
  ingredients: Ingredient[]
  personCount: number
  selectedMealMemberIds: string[]
  // 网络状态
  isOnline: boolean
  // 加载状态
  loadingMembers: boolean
}

interface AppContextType extends AppState {
  setActiveMemberById: (memberId: string) => Promise<void>
  refreshMembers: (userId: string) => Promise<void>
  setBLEStatus: (status: BLEStatus) => void
  setConnectedDevice: (device: Device | null) => void
  setBatteryLevel: (level: number) => void
  setCurrentWeight: (weight: number) => void
  setWeightUnit: (unit: WeightUnit) => void
  setIsWeightStable: (stable: boolean) => void
  setHasTare: (tare: boolean) => void
  addIngredient: (ingredient: Ingredient) => void
  removeIngredient: (index: number) => void
  clearIngredients: () => void
  setPersonCount: (count: number) => void
  setSelectedMealMemberIds: (memberIds: string[]) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({children, userId}: {children: ReactNode; userId?: string}) {
  const [activeMember, setActiveMember2] = useState<FamilyMember | null>(null)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [bleStatus, setBLEStatus] = useState<BLEStatus>('disconnected')
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null)
  const [batteryLevel, setBatteryLevel] = useState(0)
  const [currentWeight, setCurrentWeight] = useState(0)
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('g')
  const [isWeightStable, setIsWeightStable] = useState(false)
  const [hasTare, setHasTare] = useState(false)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [personCount, setPersonCount] = useState(1)
  const [selectedMealMemberIds, setSelectedMealMemberIdsState] = useState<string[]>([])
  const [isOnline, setIsOnline] = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)

  useEffect(() => {
    setPersonCount(Math.max(1, selectedMealMemberIds.length))
  }, [selectedMealMemberIds])

  // 监听网络状态
  useEffect(() => {
    Taro.onNetworkStatusChange(({isConnected}) => {
      setIsOnline(isConnected)
    })
    Taro.getNetworkType({
      success: ({networkType}) => setIsOnline(networkType !== 'none')
    })
  }, [])

  const refreshMembers = useCallback(async (uid: string) => {
    setLoadingMembers(true)
    try {
      const members = await getFamilyMembers(uid)
      setFamilyMembers(members)
      const activeId = await getActiveMemberId(uid)
      if (activeId) {
        const found = members.find(m => m.id === activeId)
        const nextActive = found || members.find(m => m.is_primary) || members[0] || null
        setActiveMember2(nextActive)
        setSelectedMealMemberIdsState(prev => {
          const valid = prev.filter(id => members.some(m => m.id === id))
          return valid.length > 0 ? valid : (nextActive ? [nextActive.id] : [])
        })
      } else {
        const primary = members.find(m => m.is_primary) || members[0]
        setActiveMember2(primary || null)
        setSelectedMealMemberIdsState(prev => {
          const valid = prev.filter(id => members.some(m => m.id === id))
          return valid.length > 0 ? valid : (primary ? [primary.id] : [])
        })
        if (primary) await setActiveMember(uid, primary.id)
      }
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  const setActiveMemberById = useCallback(async (memberId: string) => {
    const member = familyMembers.find(m => m.id === memberId)
    if (member && userId) {
      setActiveMember2(member)
      setSelectedMealMemberIdsState(prev => {
        if (prev.length > 0) return prev
        return [memberId]
      })
      await setActiveMember(userId, memberId)
    }
  }, [familyMembers, userId])

  const setSelectedMealMemberIds = useCallback((memberIds: string[]) => {
    const validIds = new Set(familyMembers.map(m => m.id))
    const next = Array.from(new Set(memberIds.filter(id => validIds.has(id))))
    setSelectedMealMemberIdsState(next)
  }, [familyMembers])

  const addIngredient = useCallback((ingredient: Ingredient) => {
    setIngredients(prev => [...prev, ingredient])
  }, [])

  const removeIngredient = useCallback((index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearIngredients = useCallback(() => {
    setIngredients([])
  }, [])

  return (
    <AppContext.Provider value={{
      activeMember, familyMembers, bleStatus, connectedDevice,
      batteryLevel,
      currentWeight, weightUnit, isWeightStable, hasTare,
      ingredients, personCount, selectedMealMemberIds, isOnline, loadingMembers,
      setActiveMemberById, refreshMembers,
      setBLEStatus, setConnectedDevice, setBatteryLevel,
      setCurrentWeight, setWeightUnit, setIsWeightStable, setHasTare,
      addIngredient, removeIngredient, clearIngredients, setPersonCount, setSelectedMealMemberIds
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppStore() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppStore must be used within AppProvider')
  return ctx
}
