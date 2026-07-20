// @title 提醒设置
import {useCallback, useEffect, useRef, useState} from 'react'
import Taro from '@tarojs/taro'
import {Picker} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {withRouteGuard} from '@/components/RouteGuard'
import {getReminderSettings} from '@/db/api'
import type {ReminderSettings} from '@/db/types'
import {
  getReminderTemplates,
  saveReminderReservations,
  type ReminderKind,
  type ReminderTemplateMap
} from '@/services/notificationService'

const REMINDER_ITEMS = [
  {key: 'breakfast', label: '早餐提醒', icon: 'i-mdi-weather-sunset-up', timeKey: 'breakfast_time'},
  {key: 'lunch',     label: '午餐提醒', icon: 'i-mdi-weather-sunny',     timeKey: 'lunch_time'},
  {key: 'dinner',    label: '晚餐提醒', icon: 'i-mdi-weather-sunset',     timeKey: 'dinner_time'},
  {key: 'water',     label: '饮水提醒', icon: 'i-mdi-water-outline',     timeKey: 'water_time'},
] as const

const DEFAULT_REMINDERS: Partial<ReminderSettings> = {
  breakfast_enabled: false, breakfast_time: '07:30',
  lunch_enabled: false,     lunch_time: '12:00',
  dinner_enabled: false,    dinner_time: '18:30',
  water_enabled: false,     water_time: '09:00',
}

function ReminderSettingsPage() {
  const {user} = useAuth()
  const [reminders, setReminders] = useState<Partial<ReminderSettings>>(DEFAULT_REMINDERS)
  const [templates, setTemplates] = useState<ReminderTemplateMap>({})
  const [templateError, setTemplateError] = useState('')
  const [saving, setSaving] = useState(false)
  const savedRef = useRef<Partial<ReminderSettings>>(DEFAULT_REMINDERS)

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const data = await getReminderSettings(user.id)
      if (data) {
        setReminders(data)
        savedRef.current = data
      }
      const templateMap = await getReminderTemplates()
      setTemplates(templateMap)
      setTemplateError(Object.keys(templateMap).length === REMINDER_ITEMS.length ? '' : '微信一次性订阅模板尚未配置完整')
    } catch (error) {
      console.warn('提醒配置加载失败:', error instanceof Error ? error.message : error)
      setTemplateError('微信一次性订阅模板尚未配置或通知函数尚未部署')
    }
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  const toggleReminder = (key: ReminderKind) => {
    if (templateError) {
      Taro.showToast({title: '请先完成微信订阅模板配置', icon: 'none'})
      return
    }
    const enabledKey = `${key}_enabled`
    setReminders(prev => ({...prev, [enabledKey]: !(prev as any)[enabledKey]}))
  }

  const requestSubscriptions = (kinds: ReminderKind[]): Promise<ReminderKind[]> => {
    if (kinds.length === 0) return Promise.resolve([])
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return Promise.reject(new Error('订阅提醒仅支持微信小程序'))
    const pairs = kinds.flatMap(kind => templates[kind] ? [[kind, templates[kind]!] as const] : [])
    if (pairs.length !== kinds.length) return Promise.reject(new Error('微信订阅模板尚未配置完整'))
    return new Promise((resolve, reject) => {
      ;(Taro.requestSubscribeMessage as any)({
        tmplIds: pairs.map(([, templateId]) => templateId),
        success: (result: Record<string, string>) => {
          resolve(pairs.filter(([, templateId]) => result[templateId] === 'accept').map(([kind]) => kind))
        },
        fail: (error: any) => reject(new Error(error?.errMsg || '未能打开微信订阅面板'))
      })
    })
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const newlyEnabled = REMINDER_ITEMS
        .map(item => item.key as ReminderKind)
        .filter(kind => !!(reminders as any)[`${kind}_enabled`] && !(savedRef.current as any)[`${kind}_enabled`])
      const acceptedKinds = await requestSubscriptions(newlyEnabled)
      const accepted = new Set(acceptedKinds)
      const requested = new Set(newlyEnabled)
      const normalized = {...reminders}
      for (const kind of requested) {
        if (!accepted.has(kind)) (normalized as any)[`${kind}_enabled`] = false
      }
      const saved = await saveReminderReservations(normalized, acceptedKinds)
      setReminders(saved)
      savedRef.current = saved
      const rejectedCount = newlyEnabled.length - acceptedKinds.length
      Taro.showToast({title: rejectedCount > 0 ? '已保存接受的预约' : '下一次提醒已预约', icon: 'success'})
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (error) {
      Taro.showToast({title: error instanceof Error ? error.message : '保存失败，请重试', icon: 'none'})
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 说明卡片 */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-primary/10 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="i-mdi-bell-ring text-2xl text-primary flex-shrink-0" />
          <p className="text-xl text-primary">每次授权可预约下一次提醒</p>
        </div>
      </div>
      {templateError && (
        <div className="mx-4 mb-2 px-4 py-3 border rounded-xl" style={{background: '#FFF7ED', borderColor: '#F59E0B'}}>
          <p className="text-xl font-medium" style={{color: '#9A3412'}}>通知服务待配置</p>
          <p className="text-xl mt-1" style={{color: '#9A3412'}}>{templateError}</p>
        </div>
      )}
      {/* 提醒项列表 */}
      <div className="px-4 py-2 flex flex-col gap-3 flex-1">
        {REMINDER_ITEMS.map(item => {
          const isEnabled = !!(reminders as any)[`${item.key}_enabled`]
          const timeVal: string = (reminders as any)[item.timeKey] || ''
          return (
            <div key={item.key} className="bg-card rounded-2xl px-4 shadow-elegant" style={{boxShadow: '0 1px 4px rgba(0,0,0,0.06)'}}>
              <div className="flex items-center gap-4 py-4 border-b border-border">
                {/* 图标 */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-primary/10' : 'bg-secondary'}`}>
                  <div className={`${item.icon} text-2xl ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                {/* 标签 */}
                <div className="flex-1">
                  <p className="text-xl font-medium text-foreground">{item.label}</p>
                  <p className="text-xl text-muted-foreground">{timeVal}</p>
                </div>
                {/* Toggle — 使用固定内边距和 transform，避免小程序样式转换后圆点越界。 */}
                <div
                  className="relative rounded-full flex-shrink-0"
                  style={{
                    width: '44px',
                    height: '24px',
                    backgroundColor: isEnabled ? 'hsl(142 40% 34%)' : '#C4C9D4',
                    border: `1px solid ${isEnabled ? 'hsl(142 40% 34%)' : '#D6DAE2'}`,
                    transition: 'background-color 0.2s ease, border-color 0.2s ease',
                    boxSizing: 'border-box',
                  }}
                  onClick={() => toggleReminder(item.key)}
                >
                  <div
                    className="absolute bg-white rounded-full shadow"
                    style={{
                      width: '20px',
                      height: '20px',
                      top: '1px',
                      left: '1px',
                      transform: isEnabled ? 'translateX(20px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  />
                </div>
              </div>
              {/* 时间选择（仅开启时展示） */}
              {isEnabled && (
                <div className="py-3 flex items-center justify-between">
                  <span className="text-xl text-muted-foreground">提醒时间</span>
                  <Picker
                    mode="time"
                    value={timeVal}
                    onChange={(e) => {
                      const ev = e as any
                      const val = ev.detail?.value ?? ''
                      setReminders(prev => ({...prev, [item.timeKey]: val}))
                    }}
                  >
                    <div className="flex items-center gap-1 px-3 py-2 bg-primary/10 rounded-xl">
                      <span className="text-xl font-medium text-primary">{timeVal}</span>
                      <div className="i-mdi-pencil text-xl text-primary" />
                    </div>
                  </Picker>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* 功能说明 + 保存按钮 */}
      <div className="px-4 pb-safe-4 pt-2">
        <div className="flex items-start gap-2 mb-3 px-1">
          <div className="i-mdi-information-outline text-xl text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xl text-muted-foreground">保存时会一次申请已开启项目的微信订阅授权，发送后需重新预约</p>
        </div>
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none text-xl font-semibold bg-gradient-primary text-white rounded-2xl transition ${saving ? 'opacity-60' : ''}`}
          style={{height: '52px'}}
          onClick={handleSave}
          disabled={!!templateError || saving}
        >
          {saving ? '保存中...' : templateError ? '等待模板配置' : '保存并预约'}
        </button>
      </div>
    </div>
  );
}

export default withRouteGuard(ReminderSettingsPage)
