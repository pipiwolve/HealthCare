import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const supabaseClient = read('src/client/supabase.ts')
const authContext = read('src/contexts/AuthContext.tsx')
const loginPage = read('src/pages/login/index.tsx')
const routeGuard = read('src/components/RouteGuard.tsx')
const loginFunction = read('supabase/functions/wechat_miniapp_login/index.ts')
const reminderPage = read('src/pages/reminder-settings/index.tsx')
const scheduleFunction = read('supabase/functions/wechat-notification-schedule/index.ts')
const dispatchFunction = read('supabase/functions/wechat-notification-dispatch/index.ts')
const recipePage = read('src/pages/recipe/index.tsx')
const recipeSharePage = read('src/pages/recipe-share/index.tsx')
const poster = read('src/utils/recipePoster.ts')
const statsPage = read('src/pages/stats/index.tsx')
const migration = read('supabase/migrations/00005_wechat_auth_notifications_recipe_shares.sql')

assert(supabaseClient.includes('storage: taroAuthStorage') && supabaseClient.includes('persistSession: true'), 'Supabase auth must persist through Taro storage')
assert(routeGuard.includes('buildCurrentRouteUrl()') && routeGuard.includes('STORAGE_KEY_REDIRECT_PATH'), 'Route guard must retain the complete redirect URL')
assert(authContext.includes('startWechatSignIn') && authContext.includes('registerWechatSignIn') && authContext.includes('bindWechatSignIn'), 'Auth context must expose the staged WeChat flow')
assert(loginPage.includes("openType: 'getPhoneNumber'") && loginPage.includes("openType: 'chooseAvatar'") && loginPage.includes('type="nickname"') && loginPage.includes('微信快捷登录') && loginPage.includes('绑定已有账号'), 'Login page must collect optional native WeChat profile data and support existing-account binding')
assert(loginFunction.includes("case 'start'") && loginFunction.includes("case 'register'") && loginFunction.includes("case 'bind'") && loginFunction.includes('handleLegacy') && !loginFunction.includes('session_key'), 'Login function must support staged and legacy clients without returning session_key')
assert(loginPage.includes('startWechatSignIn') && read('src/services/wechatAuth.ts').includes('loginCode: code, code'), 'Client must send both new and legacy WeChat code fields')

assert(reminderPage.includes('requestSubscribeMessage') && reminderPage.includes('保存并预约') && !reminderPage.includes('placeholder-tmpl-id'), 'Reminder page must batch real configured templates on save')
assert(scheduleFunction.includes('nextShanghaiOccurrence') && scheduleFunction.includes('notification_jobs'), 'Schedule function must create one-time jobs in Asia/Shanghai')
assert(dispatchFunction.includes('claim_due_notification_jobs') && dispatchFunction.includes('subscribe/send') && dispatchFunction.includes('_enabled`]: false'), 'Dispatcher must claim, send and close reservations')
assert(dispatchFunction.includes('buildNotificationData'), 'Dispatcher must map meal and water template fields through the validated payload builder')

assert(recipePage.includes('createRecipeShare') && recipePage.includes('generateRecipePosterAssets') && recipePage.includes('showShareImageMenu') && recipePage.includes('onClick={handleShareRecipe}'), 'Recipe page must generate and share the poster from one button')
assert(recipeSharePage.includes('getRecipeShare') && recipeSharePage.includes('useShareTimeline'), 'Public recipe page must load and support onward sharing')
assert(poster.includes('card: {width: 1000, height: 800}') && poster.includes('poster: {width: 1080, height: 1440}'), 'Poster renderer must expose the required dimensions')
assert(poster.includes("ctx.setFillStyle('#FFFFFF')\n  ctx.fillRect(0, 0, width, height)\n  drawBackgroundCover("), 'Poster renderer must paint an opaque white base before the template')
assert(poster.includes("panelMargin = variant === 'poster' ? 32 : 36") && poster.includes('maxLinesPerItem') && poster.includes("variant === 'poster' ? 3 : 2"), 'Poster renderer must use the full canvas and wrap recipe steps across multiple lines')

assert(statsPage.includes('familyMembers, loadingMembers, setActiveMemberById') && statsPage.includes('showMemberPicker') && statsPage.includes('handleSelectMember') && statsPage.includes('切换查看成员'), 'Stats page must expose a family-member picker')
assert(statsPage.includes('getNutritionStats(user.id, activeMember?.id || null, period)') && statsPage.includes('await setActiveMemberById(memberId)'), 'Stats member switching must reload member-filtered nutrition data')

for (const table of ['wechat_identities', 'wechat_access_tokens', 'notification_jobs', 'recipe_shares']) {
  assert(migration.includes(`create table if not exists public.${table}`), `Migration must create ${table}`)
  assert(migration.includes(`alter table public.${table} enable row level security`), `Migration must enable RLS for ${table}`)
}

console.log('wechat feature checks passed')
