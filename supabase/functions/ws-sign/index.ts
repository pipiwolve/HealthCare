const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const AK = Deno.env.get('BAIDU_BRTC_AK') || ''
const SK = Deno.env.get('BAIDU_BRTC_SK') || ''
const APPID = Deno.env.get('BAIDU_BRTC_APPID') || 'appsf7sknqh440y'
const LICENSE_KEY = Deno.env.get('BAIDU_BRTC_LICENSE_KEY') || ''
const LICENSE_DEVICE_ID = Deno.env.get('BAIDU_BRTC_LICENSE_DEVICE_ID') || 'codex-ws-vision-test-20260624-v1'
const WS_GATEWAY = 'wss://rtc-aiotgw.exp.bcelive.com/v1/realtime'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders })

  try {
    const { cfg, mode = 'cfg', ac = 'raw16k' } = await req.json()
    if (mode !== 'default' && !cfg) throw new Error("Missing cfg")
    if (!AK || !SK) throw new Error("Missing BRTC credentials")

    let url = `${WS_GATEWAY}?a=${APPID}&ak=${AK}&sk=${SK}&ac=${ac}`
    if (mode !== 'default') {
      const cfgEncoded = encodeURIComponent(JSON.stringify(cfg))
      url += `&cfg=${cfgEncoded}`
    }

    return new Response(
      JSON.stringify({
        url,
        licenseKey: LICENSE_KEY,
        licenseDeviceId: LICENSE_DEVICE_ID,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
