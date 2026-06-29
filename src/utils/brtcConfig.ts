// WebSocket AI 服务配置（BRTC AK/SK 已迁移到 ws-sign EF 服务端）
// llm_token 用于千帆 API 内部鉴权，由 WebSocket 网关转发时携带

const QIANFAN_TOKEN = process.env.TARO_APP_QIANFAN_TOKEN || ''
const SYSTEM_ROLE = '你是一个专业的健康饮食顾问，提供营养合理、科学准确的建议。涉及疾病治疗或用药互作的问题，必须附加「请咨询专业医生」。'

// 纯文字对话（无 ASR/TTS）
export const CHAT_CFG = {
  llm: 'OPENAI',
  llm_url: 'https://qianfan.baidubce.com/v2/chat/completions',
  llm_token: QIANFAN_TOKEN,
  llm_cfg: 'ernie-4.0-8k',
  tts: 'MUTE',
  asr: 'MUTE',
  role: SYSTEM_ROLE,
}

// 视觉识别（视觉模型，无 ASR/TTS）
export const VISION_CFG = {
  ...CHAT_CFG,
  llm_cfg: 'am-04vq365sduvu',
}

// 语音实时对话（开启 ASR + TTS）
export const VOICE_CFG = {
  ...CHAT_CFG,
  tts: 'BAIDU',
  asr: 'BAIDU',
  tts_sayhi: '你好，有什么健康饮食问题可以帮到你？',
}
