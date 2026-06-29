// TTS 语音合成 Edge Function — 百度语音合成（替换 MiniMax T2A V2）
// EF 名称保持 tts-minimax 不变，客户端无需修改调用方
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const BAIDU_AK = Deno.env.get('BAIDU_TTS_AK') || ''
const BAIDU_SK = Deno.env.get('BAIDU_TTS_SK') || ''

let cachedToken: { token: string; expiry: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiry) return cachedToken.token
  const res = await fetch(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_AK}&client_secret=${BAIDU_SK}`,
    { method: 'POST' }
  )
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Baidu token')
  cachedToken = { token: data.access_token, expiry: Date.now() + (data.expires_in - 60) * 1000 }
  return data.access_token
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { text, voice_id = '0', speed = 5, pit = 5, vol = 5 } = body
    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = await getAccessToken()
    // voice_id 映射：客户端传 '111' 或数字字符串直接透传，兼容旧的字符串别名
    const per = voice_id === 'male' ? '106' : voice_id === 'female-shaonv' ? '111' : String(voice_id)
    const params = new URLSearchParams({
      tex: text.slice(0, 500),
      tok: token,
      cuid: 'weapp-tts',
      ctp: '1',
      lan: 'zh',
      spd: String(speed),
      pit: String(pit),
      vol: String(vol),
      per: per,
      aue: '3',   // MP3 格式
    })

    const upstream = await fetch('https://tsn.baidu.com/text2audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    // 百度TTS出错时返回 JSON，成功时返回音频二进制
    const contentType = upstream.headers.get('content-type') || ''
    if (contentType.includes('json')) {
      const err = await upstream.json()
      return new Response(JSON.stringify({ error: `TTS error: ${err.err_msg || err.err_no}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 将音频流上传至 Supabase Storage，返回持久化公开 URL
    const filePath = `uploads/${crypto.randomUUID()}.mp3`
    const { error: uploadErr } = await supabase.storage
      .from('generated-audio')
      .upload(filePath, upstream.body!, { contentType: 'audio/mpeg', cacheControl: '3600', upsert: false })
    if (uploadErr) throw uploadErr
    const { data: urlData } = supabase.storage.from('generated-audio').getPublicUrl(filePath)

    return new Response(
      JSON.stringify({ audioUrl: urlData.publicUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
