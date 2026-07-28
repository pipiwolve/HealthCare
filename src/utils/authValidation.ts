const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MAX_LENGTH = 72
export const EMAIL_OTP_LENGTH = 8

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(normalized)) throw new Error('请输入有效的邮箱地址')
  return normalized
}

export function normalizeRegistrationEmail(email: string): string {
  const normalized = normalizeEmail(email)
  if (normalized.endsWith('@miaoda.com') || normalized.endsWith('@wechat.login')) {
    throw new Error('该邮箱域名不可用于注册')
  }
  return normalized
}

export function getNewPasswordError(password: string): string | null {
  if (password.length < 6 || password.length > PASSWORD_MAX_LENGTH) return '密码需为6-72位'
  return null
}

export function validateNewPassword(password: string): void {
  const message = getNewPasswordError(password)
  if (message) throw new Error(message)
}

export function validateEmailOtp(code: string): void {
  if (!new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`).test(code)) {
    throw new Error(`请输入${EMAIL_OTP_LENGTH}位邮箱验证码`)
  }
}
