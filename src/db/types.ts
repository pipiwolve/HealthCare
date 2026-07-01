// 数据库类型定义

export type UserRole = 'user' | 'admin'
export type BloodType = 'A' | 'B' | 'AB' | 'O' | 'other'
export type GenderType = 'male' | 'female' | 'unknown'

export interface Profile {
  id: string
  username: string | null
  openid: string | null
  nickname: string | null
  avatar_url: string | null
  role: UserRole
  has_seen_disclaimer: boolean
  has_seen_guide: boolean
  created_at: string
  updated_at: string
}

export interface FamilyMember {
  id: string
  user_id: string
  nickname: string
  avatar_url: string | null
  gender: GenderType
  age: number | null
  height: number | null
  weight: number | null
  birthday: string | null
  blood_type: BloodType | null
  chronic_diseases: string[]
  allergens: string[]
  medications: string | null
  daily_calorie_goal: number | null
  daily_protein_goal: number | null
  daily_fat_goal: number | null
  daily_carb_goal: number | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

export interface Device {
  id: string
  user_id: string
  device_id: string
  device_name: string
  device_model: string | null
  service_uuid: string | null
  is_connected: boolean
  battery_level: number
  created_at: string
  updated_at: string
}

export interface Ingredient {
  name: string
  weight: number
  unit: string
  hasAllergen?: boolean
  allergenName?: string
  image_url?: string | null  // 拍照识别时写入，手动输入为 null
}

export interface WeighingRecord {
  id: string
  user_id: string
  member_id: string | null
  ingredients: Ingredient[]
  person_count: number
  analysis_result: string | null
  total_calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
  created_at: string
}

export interface ChatSession {
  id: string
  user_id: string
  member_id: string | null
  title: string
  context_data: {
    ingredients?: Ingredient[]
    analysis?: string
    use_profile?: boolean
  }
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  image_url: string | null
  created_at: string
  audio_url?: string | null
}

export interface RtcHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface RtcHistoryGroup {
  id: string
  title: string
  startTime: number
  endTime: number
  messages: RtcHistoryMessage[]
}

export interface ReminderSettings {
  id: string
  user_id: string
  breakfast_enabled: boolean
  breakfast_time: string
  lunch_enabled: boolean
  lunch_time: string
  dinner_enabled: boolean
  dinner_time: string
  water_enabled: boolean
  water_time: string
  updated_at: string
}

export interface NutritionStats {
  date: string
  total_calories: number
  protein: number
  fat: number
  carbs: number
  records_count: number
}
