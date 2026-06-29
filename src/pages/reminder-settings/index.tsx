// @title 提醒设置
import {useCallback, useEffect, useState} from 'react'
import Taro from '@tarojs/taro'
import {Picker} from '@tarojs/components'
import {useAuth} from '@/contexts/AuthContext'
import {withRouteGuard} from '@/components/RouteGuard'
import {getReminderSettings, upsertReminderSettings} from '@/db/api'
import type {ReminderSettings} from '@/db/types'

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
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return
    const data = await getReminderSettings(user.id)
    if (data) setReminders(data)
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  const toggleReminder = (key: string) => {
    const enabledKey = `${key}_enabled`
    const willEnable = !(reminders as any)[enabledKey]

    if (willEnable) {
      // 开启时请求微信订阅消息授权（Taro 类型定义与实际 wx API 不一致，cast as any）
      ;(Taro.requestSubscribeMessage as any)({
        // 占位模板 ID — 正式使用时替换为在微信公众平台审核通过的真实 tmplId
        tmplIds: ['placeholder-tmpl-id'],
        success: (res: any) => {
          const accepted = Object.values(res).some(v => v === 'accept')
          if (accepted) {
            setReminders(prev => ({...prev, [enabledKey]: true}))
          } else {
            Taro.showToast({title: '需要授权通知权限', icon: 'none'})
          }
        },
        fail: () => {
          // 用户拒绝或系统不支持：Toggle 保持关闭
          Taro.showToast({title: '需要授权通知权限', icon: 'none'})
        }
      })
    } else {
      setReminders(prev => ({...prev, [enabledKey]: false}))
    }
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await upsertReminderSettings(user.id, reminders)
      Taro.showToast({title: '提醒设置已保存', icon: 'success'})
      setTimeout(() => Taro.navigateBack(), 800)
    } catch {
      Taro.showToast({title: '保存失败，请重试', icon: 'none'})
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
          <p className="text-xl text-primary">开启后将在设定时间收到提醒通知</p>
        </div>
      </div>
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
          <p className="text-xl text-muted-foreground">提醒功能开发中，授权后将在后续版本生效</p>
        </div>
        <button
          type="button"
          className={`w-full flex items-center justify-center leading-none text-xl font-semibold bg-gradient-primary text-white rounded-2xl transition ${saving ? 'opacity-60' : ''}`}
          style={{height: '52px'}}
          onClick={handleSave}
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

export default withRouteGuard(ReminderSettingsPage)
