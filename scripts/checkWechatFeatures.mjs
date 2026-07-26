import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const supabaseClient = read('src/client/supabase.ts')
const tailwindConfig = read('tailwind.config.js')
const authContext = read('src/contexts/AuthContext.tsx')
const loginPage = read('src/pages/login/index.tsx')
const accountSettingsPage = read('src/pages/account-settings/index.tsx')
const routeGuard = read('src/components/RouteGuard.tsx')
const loginFunction = read('supabase/functions/wechat_miniapp_login/index.ts')
const reminderPage = read('src/pages/reminder-settings/index.tsx')
const scheduleFunction = read('supabase/functions/wechat-notification-schedule/index.ts')
const dispatchFunction = read('supabase/functions/wechat-notification-dispatch/index.ts')
const recipePage = read('src/pages/recipe/index.tsx')
const recipeSharePage = read('src/pages/recipe-share/index.tsx')
const poster = read('src/utils/recipePoster.ts')
const statsPage = read('src/pages/stats/index.tsx')
const profilePage = read('src/pages/profile/index.tsx')
const calorieHistoryPage = read('src/pages/calorie-history/index.tsx')
const memberSwitcher = read('src/components/NutritionMemberSwitcher.tsx')
const macroDonut = read('src/components/MacroDonutChart.tsx')
const appConfig = read('src/app.config.ts')
const migration = read('supabase/migrations/00005_wechat_auth_notifications_recipe_shares.sql')

assert(supabaseClient.includes('storage: taroAuthStorage') && supabaseClient.includes('persistSession: true'), 'Supabase auth must persist through Taro storage')
assert(routeGuard.includes('buildCurrentRouteUrl()') && routeGuard.includes('STORAGE_KEY_REDIRECT_PATH'), 'Route guard must retain the complete redirect URL')
assert((tailwindConfig.match(/\bcolors:\s*\{/g) || []).length === 1 && tailwindConfig.includes("warning: {"), 'Tailwind theme colors must share one extend.colors object')
assert(authContext.includes('startWechatSignIn') && authContext.includes('bindWechatSignIn') && !authContext.includes('registerWechatSignIn'), 'Auth context must expose login and existing-account binding without direct WeChat registration')
assert(loginPage.includes("openType: 'chooseAvatar'") && loginPage.includes('type="nickname"') && loginPage.includes('还没有账号，先注册') && loginPage.includes('注册并绑定微信') && loginPage.includes('绑定已有账号'), 'Login page must collect optional WeChat profile data and register or authenticate an account before binding')
assert(loginFunction.includes("case 'start'") && loginFunction.includes("case 'register'") && loginFunction.includes("case 'bind'") && loginFunction.includes("case 'unbind'") && loginFunction.includes('handleLegacy') && !loginFunction.includes('session_key'), 'Login function must support staged, binding, unbind, and legacy flows without returning session_key')
assert(loginPage.includes('startWechatSignIn') && read('src/services/wechatAuth.ts').includes('loginCode: code, code'), 'Client must send both new and legacy WeChat code fields')
assert(accountSettingsPage.includes("title: '绑定当前微信'") && !accountSettingsPage.includes('setUsernameLogin') && accountSettingsPage.includes('unbindWechatAccount') && accountSettingsPage.includes('旧版微信独立账号'), 'Account settings must bind registered accounts and guard legacy WeChat-only accounts')
assert(loginFunction.includes('isUsernameLoginEmail') && loginFunction.includes('verifyPassword') && loginFunction.includes('该微信已绑定其他账号'), 'Account identity function must enforce credential and WeChat conflicts before unbinding')

assert(reminderPage.includes('requestSubscribeMessage') && reminderPage.includes('保存并预约') && !reminderPage.includes('placeholder-tmpl-id'), 'Reminder page must batch real configured templates on save')
assert(scheduleFunction.includes('nextShanghaiOccurrence') && scheduleFunction.includes('notification_jobs'), 'Schedule function must create one-time jobs in Asia/Shanghai')
assert(dispatchFunction.includes('claim_due_notification_jobs') && dispatchFunction.includes('subscribe/send') && dispatchFunction.includes('_enabled`]: false'), 'Dispatcher must claim, send and close reservations')
assert(dispatchFunction.includes('buildNotificationData'), 'Dispatcher must map meal and water template fields through the validated payload builder')

assert(recipePage.includes('createRecipeShare') && recipePage.includes('generateRecipePosterAssets') && recipePage.includes('showShareImageMenu') && recipePage.includes('onClick={handleShareRecipe}'), 'Recipe page must generate and share the poster from one button')
assert(recipeSharePage.includes('getRecipeShare') && recipeSharePage.includes('useShareTimeline'), 'Public recipe page must load and support onward sharing')
assert(poster.includes('card: {width: 1000, height: 800}') && poster.includes('poster: {width: 1080, height: 1440}'), 'Poster renderer must expose the required dimensions')
assert(poster.includes("ctx.setFillStyle('#FFFFFF')\n  ctx.fillRect(0, 0, width, height)\n  drawBackgroundCover("), 'Poster renderer must paint an opaque white base before the template')
assert(poster.includes("panelMargin = variant === 'poster' ? 32 : 36") && poster.includes('maxLinesPerItem') && poster.includes("variant === 'poster' ? 3 : 2"), 'Poster renderer must use the full canvas and wrap recipe steps across multiple lines')

assert(statsPage.includes('<NutritionMemberSwitcher') && calorieHistoryPage.includes('<NutritionMemberSwitcher'), 'Stats and calorie history pages must share the family-member picker')
assert(statsPage.includes('getNutritionStats(user.id, activeMember?.id || null, period)') && memberSwitcher.includes('await setActiveMemberById(memberId)'), 'Nutrition member switching must reload member-filtered data')
assert(statsPage.includes('<MacroDonutChart') && macroDonut.includes("ctx.arc(center, center, radius"), 'Stats page must render macronutrients as a donut chart')
assert(!macroDonut.includes('百分比按营养素供能计算') && macroDonut.includes('text-lg'), 'Macro legend must use the compact layout without the calculation footnote')
assert(!statsPage.includes('<CalorieHistoryPanel') && calorieHistoryPage.includes('<CalorieHistoryPanel'), 'Calorie history must live on its dedicated page')
assert(profilePage.includes("label: '历史记录查询', desc: '热量趋势'") && appConfig.includes("'pages/calorie-history/index'"), 'Profile must link to the registered calorie history page with the compact description')

for (const table of ['wechat_identities', 'wechat_access_tokens', 'notification_jobs', 'recipe_shares']) {
  assert(migration.includes(`create table if not exists public.${table}`), `Migration must create ${table}`)
  assert(migration.includes(`alter table public.${table} enable row level security`), `Migration must enable RLS for ${table}`)
}

console.log('wechat feature checks passed')
