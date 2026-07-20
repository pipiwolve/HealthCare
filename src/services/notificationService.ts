import {supabase} from '@/client/supabase'
import type {ReminderSettings} from '@/db/types'

export type ReminderKind = 'breakfast' | 'lunch' | 'dinner' | 'water'
export type ReminderTemplateMap = Partial<Record<ReminderKind, string>>

async function functionError(error: any): Promise<Error> {
  try {
    const text = await error?.context?.text?.()
    if (text) {
      const data = JSON.parse(text)
      return new Error(data.message || '提醒服务不可用')
    }
  } catch {}
  return new Error(error?.message || '提醒服务不可用')
}

async function invoke(body: Record<string, unknown>): Promise<any> {
  const {data, error} = await supabase.functions.invoke('wechat-notification-schedule', {body})
  if (error) throw await functionError(error)
  return data
}

export async function getReminderTemplates(): Promise<ReminderTemplateMap> {
  const data = await invoke({action: 'templates'})
  return data?.templates || {}
}

export async function saveReminderReservations(
  settings: Partial<ReminderSettings>,
  acceptedKinds: ReminderKind[]
): Promise<Partial<ReminderSettings>> {
  const data = await invoke({action: 'save', settings, acceptedKinds})
  if (!data?.settings) throw new Error('提醒保存结果异常')
  return data.settings
}
