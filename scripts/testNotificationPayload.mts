import {strict as assert} from 'node:assert'
import notificationPayload from '../supabase/functions/_shared/notification-payload'

const {buildNotificationData} = notificationPayload

const mealConfig = {
  mode: 'meal',
  templateId: 'meal-template',
  page: '/pages/home/index',
  fields: {menu: 'thing1', date: 'time2', checkInTime: 'time4'}
} as const
const waterConfig = {
  mode: 'water',
  templateId: 'water-template',
  page: '/pages/home/index',
  fields: {tip: 'thing1', drinkTime: 'time6'}
} as const

assert.deepEqual(buildNotificationData('breakfast', mealConfig, '2026-07-15T00:05:00.000Z'), {
  thing1: {value: '早餐健康餐单'},
  time2: {value: '2026-07-15'},
  time4: {value: '08:05'}
})
assert.deepEqual(buildNotificationData('water', waterConfig, '2026-07-15T09:20:00.000Z'), {
  thing1: {value: '饮水时间到啦，请记得适量饮水'},
  time6: {value: '17:20'}
})
assert.throws(() => buildNotificationData('water', mealConfig, '2026-07-15T00:00:00.000Z'), /mode mismatch/)

console.log('notification payload tests passed')
