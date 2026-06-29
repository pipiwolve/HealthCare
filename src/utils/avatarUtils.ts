// 头像资源工具 — 按性别返回对应卡通头像 URL
export const AVATAR_MALE_URL =
  'https://miaoda-conversation-file.cdn.bcebos.com/user-c3jta90r2ebk/app-c6x1q6fsddz5/20260609/avatar_male_1781009961206.png'

export const AVATAR_FEMALE_URL =
  'https://miaoda-conversation-file.cdn.bcebos.com/user-c3jta90r2ebk/app-c6x1q6fsddz5/20260609/avatar_female_1781009961205.png'

/**
 * 根据性别返回对应头像 URL
 * @param gender 成员性别字段值
 * @returns 头像图片 URL
 */
export function getAvatarByGender(gender?: string | null): string {
  return gender === 'female' ? AVATAR_FEMALE_URL : AVATAR_MALE_URL
}
