// wechat_miniapp_login — 微信小程序登录 EF
// 1. 用微信 code 换取 openid
// 2. 自动创建/复用 Supabase 用户
// 3. 生成 magiclink token 返回给客户端
import { createClient } from 'jsr:@supabase/supabase-js'

const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { code } = await req.json().catch(() => ({}))
    if (!code) {
      return new Response(JSON.stringify({ message: '缺少code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    const APP_ID = Deno.env.get("WECHAT_MINIPROGRAM_LOGIN_APP_ID")
    const APP_SECRET = Deno.env.get("WECHAT_MINIPROGRAM_LOGIN_APP_SECRET")

    const wxRes = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${APP_ID}&secret=${APP_SECRET}&js_code=${code}&grant_type=authorization_code`
    )
    const wxData = await wxRes.json()

    if (wxData.errcode) {
      return new Response(JSON.stringify({ message: `微信接口错误: ${wxData.errmsg}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    const { openid } = wxData
    const email = `${openid}@wechat.login`

    // 若用户不存在则创建；忽略"已注册"错误
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { from: 'wechat', openid },
    })
    if (createError && !createError.message.includes('already been registered')) {
      return new Response(JSON.stringify({ message: createError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    const { data: magicLinkData, error: magicLinkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { data: { from: 'wechat', openid } },
      })

    if (magicLinkError) {
      return new Response(JSON.stringify({ message: magicLinkError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    const hashedToken = magicLinkData?.properties?.hashed_token ?? ''
    if (!hashedToken) {
      return new Response(JSON.stringify({ message: '无法生成token' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    return new Response(JSON.stringify({ token: hashedToken, openid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})
