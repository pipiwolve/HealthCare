export type ReminderKind = 'breakfast' | 'lunch' | 'dinner' | 'water'

interface BaseTemplateConfig {
  templateId: string
  page: string
}

export interface MealTemplateConfig extends BaseTemplateConfig {
  mode: 'meal'
  fields: {menu: string; date: string; checkInTime: string}
}

export interface WaterTemplateConfig extends BaseTemplateConfig {
  mode: 'water'
  fields: {tip: string; drinkTime: string}
}

export type WechatTemplateConfig = MealTemplateConfig | WaterTemplateConfig

const MEAL_NAMES: Record<Exclude<ReminderKind, 'water'>, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐'
}

function shanghaiParts(value: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value))
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

export function buildNotificationData(
  kind: ReminderKind,
  config: WechatTemplateConfig,
  scheduledAt: string
): Record<string, {value: string}> {
  const parts = shanghaiParts(scheduledAt)
  const clock = `${parts.hour}:${parts.minute}`

  if (kind === 'water') {
    if (config.mode !== 'water') throw new Error('Water reminder template mode mismatch')
    return {
      [config.fields.tip]: {value: '饮水时间到啦，请记得适量饮水'},
      [config.fields.drinkTime]: {value: clock}
    }
  }

  if (config.mode !== 'meal') throw new Error('Meal reminder template mode mismatch')
  return {
    [config.fields.menu]: {value: `${MEAL_NAMES[kind]}健康餐单`},
    [config.fields.date]: {value: `${parts.year}-${parts.month}-${parts.day}`},
    [config.fields.checkInTime]: {value: clock}
  }
}

export default {buildNotificationData}
