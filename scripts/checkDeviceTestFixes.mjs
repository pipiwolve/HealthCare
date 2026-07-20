import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const home = read('src/pages/home/index.tsx')
const chat = read('src/pages/chat/index.tsx')
const familyEdit = read('src/pages/family-edit/index.tsx')
const family = read('src/pages/family/index.tsx')
const stats = read('src/pages/stats/index.tsx')
const profile = read('src/pages/profile/index.tsx')
const ble = read('src/utils/bleService.ts')
const cloudInstructions = read('docs/cloud-agent-wechat-incremental/DEPLOY_AND_VERIFY.md')

assert(home.includes('setCurrentIngredientImageUrl(localPreviewPath)'), 'Photo selection must create an immediate local preview')
assert(home.includes('uploadedImageUrl || localPreviewPath'), 'Ingredient images must fall back to the local preview')
assert(home.includes('setConnectedDevice(devices[0] || null)'), 'The bound database device must populate shared state')
assert(!home.includes('onDeviceNameUpdate:'), 'Broadcast names must not overwrite the bound device alias on home')

assert(chat.includes('adjustPosition={false}') && chat.includes('onKeyboardHeightChange'), 'Chat input must follow the measured keyboard height')
const voiceFooter = chat.slice(chat.indexOf('{voiceMode ? ('), chat.indexOf(') : (', chat.indexOf('{voiceMode ? (')))
assert(!voiceFooter.includes('i-mdi-robot'), 'Voice input footer must not render a robot action')

assert(familyEdit.includes("openType: 'chooseAvatar'") && familyEdit.includes('uploadWechatAvatar'), 'Family editor must upload custom avatars')
assert(family.includes('getMemberAvatar(member)') && stats.includes('getMemberAvatar(member)'), 'Custom member avatars must render in management and switching views')

assert(ble.includes("SUPPORTED_BLE_DEVICE_NAME = 'Bai'") && ble.includes('isSupportedBLEDeviceName(name)'), 'BLE discovery must only expose supported Bai devices')
assert(ble.includes('device.RSSI > STRONG_BLE_SIGNAL_RSSI'), 'Automatic recommendation must require a strong supported device')
assert(read('src/pages/device-add/index.tsx').includes('.filter(isStrongSupportedBLEDevice)'), 'Device recommendation must use the centralized name and signal rule')
assert(profile.includes('i-mdi-scale text-2xl'), 'Nutrition scale status must use a scale icon')

assert(cloudInstructions.includes('每分钟调用 `wechat-notification-dispatch`'), 'Cloud scheduler must target the notification dispatcher')
assert(cloudInstructions.includes('不能作为定时器目标'), 'Cloud instructions must reject the schedule function as a timer target')

console.log('device test fix checks passed')
