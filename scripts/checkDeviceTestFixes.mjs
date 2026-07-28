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
const memberSwitcher = read('src/components/NutritionMemberSwitcher.tsx')
const profile = read('src/pages/profile/index.tsx')
const ble = read('src/utils/bleService.ts')
const cloudInstructions = read('docs/cloud-agent-wechat-incremental/DEPLOY_AND_VERIFY.md')

assert(home.includes('setCurrentIngredientImage({preview_url: localPreviewPath})'), 'Photo selection must create an immediate local preview')
assert(
  home.includes('setCurrentIngredientImage({preview_url: localPreviewPath, ...(storedImage || {})})') &&
    home.includes('图片仅在本机临时显示'),
  'Ingredient images must fall back to the local preview',
)
assert(!home.includes('i-mdi-microphone') && !home.includes('getRecorderManager()') && !home.includes("'voice-ptt'"), 'Home photo recognition must not include short voice input controls or ASR')
assert(home.includes('setConnectedDevice(devices[0] || null)'), 'The bound database device must populate shared state')
assert(!home.includes('onDeviceNameUpdate:'), 'Broadcast names must not overwrite the bound device alias on home')

assert(chat.includes('adjustPosition={false}') && chat.includes('onKeyboardHeightChange'), 'Chat input must follow the measured keyboard height')
const voiceFooter = chat.slice(chat.indexOf('{voiceMode ? ('), chat.indexOf(') : (', chat.indexOf('{voiceMode ? (')))
assert((voiceFooter.match(/<button\b/g) || []).length === 1, 'Voice input footer must only render the keyboard switch button beside the hold-to-talk area')
assert(!voiceFooter.includes('i-mdi-robot'), 'Voice input footer must not render a robot action')
assert(!voiceFooter.includes('i-mdi-microphone'), 'Voice mode hold-to-talk area must not render the microphone icon regression')
assert(!chat.includes('VOICE_LONG_PRESS_MS') && chat.includes('voiceStopRequestedRef') && chat.includes('voiceRecordingAttemptRef'), 'Voice recording must start immediately and retain release requests while the recorder is starting')
assert(chat.includes('VOICE_STOP_TIMEOUT_MS') && chat.includes('voiceStopFallbackTimerRef') && chat.includes('录音停止超时，请重试'), 'Voice recording must recover when RecorderManager onStop is delayed or missing')
assert(chat.includes('onTouchCancel={handleVoiceTouchCancel}') && chat.includes('if (voiceStopRequestedRef.current) return'), 'Voice release and cancellation must be idempotent across duplicate native touch-end events')
assert(chat.includes('resetVoiceCaptureVisualState()') && !chat.includes('isVoiceStopping') && !chat.includes('正在发送...'), 'Voice capture controls must return to idle immediately while recognition continues in the message list')
assert(chat.includes('onClick={handleEnterVoiceMode}') && chat.includes('void ensureRecordPermission()') && chat.includes('recordPermissionRequestRef'), 'Entering voice mode must preflight microphone permission and deduplicate concurrent permission requests')

assert(familyEdit.includes("openType: 'chooseAvatar'") && familyEdit.includes('uploadWechatAvatar'), 'Family editor must upload custom avatars')
assert(family.includes('getMemberAvatar(member)') && memberSwitcher.includes('getMemberAvatar(member)'), 'Custom member avatars must render in management and switching views')

assert(ble.includes("SUPPORTED_BLE_DEVICE_NAME = 'Bai'") && ble.includes('isSupportedBLEDeviceName(name)'), 'BLE discovery must only expose supported Bai devices')
assert(ble.includes('device.RSSI > STRONG_BLE_SIGNAL_RSSI'), 'Automatic recommendation must require a strong supported device')
assert(read('src/pages/device-add/index.tsx').includes('.filter(isStrongSupportedBLEDevice)'), 'Device recommendation must use the centralized name and signal rule')
assert(profile.includes('i-mdi-scale text-2xl'), 'Nutrition scale status must use a scale icon')

assert(cloudInstructions.includes('每分钟调用 `wechat-notification-dispatch`'), 'Cloud scheduler must target the notification dispatcher')
assert(cloudInstructions.includes('不能作为定时器目标'), 'Cloud instructions must reject the schedule function as a timer target')

console.log('device test fix checks passed')
