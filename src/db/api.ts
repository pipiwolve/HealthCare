// 数据库API封装
import {supabase} from '@/client/supabase'
import type {
  Profile, FamilyMember, Device,
  WeighingRecord, ChatSession, ChatMessage,
  ReminderSettings, NutritionStats, Ingredient
} from './types'

// ===== Profile API =====
export async function getProfile(userId: string): Promise<Profile | null> {
  const {data, error} = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) console.error('getProfile error:', error)
  return data
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<boolean> {
  const {error} = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
  if (error) console.error('updateProfile error:', error)
  return !error
}

// ===== Family Members API =====
export async function getFamilyMembers(userId: string): Promise<FamilyMember[]> {
  const {data, error} = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', userId)
    .order('is_primary', {ascending: false})
    .order('created_at', {ascending: true})
  if (error) console.error('getFamilyMembers error:', error)
  return Array.isArray(data) ? data : []
}

export async function createFamilyMember(member: Omit<FamilyMember, 'id' | 'created_at' | 'updated_at'>): Promise<FamilyMember | null> {
  const {data, error} = await supabase
    .from('family_members')
    .insert(member)
    .select()
    .maybeSingle()
  if (error) console.error('createFamilyMember error:', error)
  return data
}

export async function updateFamilyMember(id: string, updates: Partial<FamilyMember>): Promise<boolean> {
  const {error} = await supabase
    .from('family_members')
    .update(updates)
    .eq('id', id)
  if (error) console.error('updateFamilyMember error:', error)
  return !error
}

export async function getFamilyMember(id: string): Promise<FamilyMember | null> {
  const {data, error} = await supabase
    .from('family_members')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) console.error('getFamilyMember error:', error)
  return data || null
}

export async function deleteFamilyMember(id: string): Promise<boolean> {
  const {error} = await supabase
    .from('family_members')
    .delete()
    .eq('id', id)
  if (error) console.error('deleteFamilyMember error:', error)
  return !error
}

export async function getActiveMemberId(userId: string): Promise<string | null> {
  const {data} = await supabase
    .from('user_active_member')
    .select('member_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.member_id || null
}

export async function setActiveMember(userId: string, memberId: string): Promise<boolean> {
  const {error} = await supabase
    .from('user_active_member')
    .upsert({user_id: userId, member_id: memberId, updated_at: new Date().toISOString()})
  if (error) console.error('setActiveMember error:', error)
  return !error
}

// ===== Devices API =====
export async function getDevices(userId: string): Promise<Device[]> {
  const {data, error} = await supabase
    .from('devices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', {ascending: true})
  if (error) console.error('getDevices error:', error)
  return Array.isArray(data) ? data : []
}

export async function upsertDevice(device: Omit<Device, 'id' | 'created_at' | 'updated_at'>): Promise<Device | null> {
  const {data, error} = await supabase
    .from('devices')
    .upsert(device, {onConflict: 'user_id,device_id'})
    .select()
    .maybeSingle()
  if (error) console.error('upsertDevice error:', error)
  return data
}

export async function updateDevice(id: string, updates: Partial<Device>): Promise<boolean> {
  const {error} = await supabase
    .from('devices')
    .update(updates)
    .eq('id', id)
  if (error) console.error('updateDevice error:', error)
  return !error
}

export async function deleteDevice(id: string): Promise<boolean> {
  const {error} = await supabase
    .from('devices')
    .delete()
    .eq('id', id)
  if (error) console.error('deleteDevice error:', error)
  return !error
}

// ===== Weighing Records API =====
export async function getWeighingRecords(userId: string, memberId?: string, limit = 20): Promise<WeighingRecord[]> {
  let query = supabase
    .from('weighing_records')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', {ascending: false})
    .limit(limit)
  if (memberId) query = query.eq('member_id', memberId)
  const {data, error} = await query
  if (error) console.error('getWeighingRecords error:', error)
  return Array.isArray(data) ? data : []
}

export async function createWeighingRecord(record: {
  user_id: string
  member_id: string | null
  ingredients: Ingredient[]
  person_count: number
  analysis_result: string | null
  total_calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
}): Promise<WeighingRecord | null> {
  const {data, error} = await supabase
    .from('weighing_records')
    .insert(record)
    .select()
    .maybeSingle()
  if (error) console.error('createWeighingRecord error:', error)
  return data
}

// ===== Chat Sessions API =====
export async function getChatSessions(userId: string, limit = 50): Promise<ChatSession[]> {
  const {data, error} = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', {ascending: false})
    .limit(limit)
  if (error) console.error('getChatSessions error:', error)
  return Array.isArray(data) ? data : []
}

export async function createChatSession(session: {
  user_id: string
  member_id: string | null
  title: string
  context_data: object
}): Promise<ChatSession | null> {
  const {data, error} = await supabase
    .from('chat_sessions')
    .insert(session)
    .select()
    .maybeSingle()
  if (error) console.error('createChatSession error:', error)
  return data
}

export async function updateChatSession(id: string, updates: Partial<ChatSession>): Promise<boolean> {
  const {error} = await supabase
    .from('chat_sessions')
    .update(updates)
    .eq('id', id)
  if (error) console.error('updateChatSession error:', error)
  return !error
}

export async function deleteChatSession(id: string): Promise<boolean> {
  const {error} = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', id)
  if (error) console.error('deleteChatSession error:', error)
  return !error
}

export async function deleteMultipleChatSessions(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  const {error} = await supabase
    .from('chat_sessions')
    .delete()
    .in('id', ids)
  if (error) console.error('deleteMultipleChatSessions error:', error)
  return !error
}

// ===== Chat Messages API =====
export async function getChatMessages(sessionId: string, limit = 50, cursor?: string): Promise<ChatMessage[]> {
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', {ascending: true})
    .limit(limit)
  if (cursor) query = query.lt('created_at', cursor)
  const {data, error} = await query
  if (error) console.error('getChatMessages error:', error)
  return Array.isArray(data) ? data : []
}

export async function createChatMessage(msg: {
  session_id: string
  role: 'user' | 'assistant'
  content: string
  image_url?: string | null
}): Promise<ChatMessage | null> {
  const {data, error} = await supabase
    .from('chat_messages')
    .insert(msg)
    .select()
    .maybeSingle()
  if (error) console.error('createChatMessage error:', error)
  return data
}

export async function deleteAllChatMessages(userId: string): Promise<boolean> {
  // 通过 session 关联删除
  const {data: sessions} = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('user_id', userId)
  if (!sessions || sessions.length === 0) return true
  const sessionIds = sessions.map(s => s.id)
  const {error} = await supabase
    .from('chat_sessions')
    .delete()
    .in('id', sessionIds)
  if (error) console.error('deleteAllChatMessages error:', error)
  return !error
}

// ===== Reminder Settings API =====
export async function getReminderSettings(userId: string): Promise<ReminderSettings | null> {
  const {data, error} = await supabase
    .from('reminder_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('getReminderSettings error:', error)
  return data
}

export async function upsertReminderSettings(userId: string, settings: Partial<ReminderSettings>): Promise<boolean> {
  const {error} = await supabase
    .from('reminder_settings')
    .upsert({...settings, user_id: userId, updated_at: new Date().toISOString()})
  if (error) console.error('upsertReminderSettings error:', error)
  return !error
}

// ===== Nutrition Stats API =====
export async function getNutritionStats(userId: string, memberId: string | null, period: 'day' | 'week' | 'month'): Promise<NutritionStats[]> {
  const now = new Date()
  let startDate: Date
  if (period === 'day') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  } else if (period === 'week') {
    const day = now.getDay()
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  let query = supabase
    .from('weighing_records')
    .select('created_at, total_calories, protein, fat, carbs')
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', {ascending: true})
  if (memberId) query = query.eq('member_id', memberId)

  const {data, error} = await query
  if (error) console.error('getNutritionStats error:', error)

  // 按日聚合
  const grouped: Record<string, NutritionStats> = {}
  for (const row of data || []) {
    const date = row.created_at.split('T')[0]
    if (!grouped[date]) {
      grouped[date] = {date, total_calories: 0, protein: 0, fat: 0, carbs: 0, records_count: 0}
    }
    grouped[date].total_calories += row.total_calories || 0
    grouped[date].protein += row.protein || 0
    grouped[date].fat += row.fat || 0
    grouped[date].carbs += row.carbs || 0
    grouped[date].records_count++
  }
  return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
}
