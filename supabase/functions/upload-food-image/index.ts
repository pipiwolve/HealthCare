// upload-food-image Edge Function
// 接收 base64 图片 → 解码为 ArrayBuffer → 用 service_role 上传到 chat-images bucket → 返回公开 URL
// 之所以在服务端处理：微信小程序中 Taro.request 不支持二进制 body，Storage SDK 和 Taro.uploadFile 均无法可靠上传

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// 将 base64 字符串解码为 Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  // 去除 data URL 前缀（如 data:image/jpeg;base64,）
  const raw = base64.includes(',') ? base64.split(',')[1] : base64
  const binaryStr = atob(raw)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { image, ext = "jpg" } = body

    if (!image) {
      return new Response(
        JSON.stringify({ error: "Missing image" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUrl = Deno.env.get("APP_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // 生成唯一文件路径
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const contentType = safeExt === 'jpg' ? 'image/jpeg' : `image/${safeExt}`
    const objectPath = `food-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`
    const uploadUrl = `${supabaseUrl}/storage/v1/object/chat-images/${objectPath}`

    // 解码 base64 为二进制
    const imageBytes = base64ToUint8Array(image)

    // 用 service_role 直接 POST 到 Supabase Storage REST API
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": contentType,
        "x-upsert": "false",
      },
      body: imageBytes,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      return new Response(
        JSON.stringify({ error: `Storage upload failed: ${uploadRes.status} ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/chat-images/${objectPath}`

    return new Response(
      JSON.stringify({ url: publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
