import {supabase} from '@/client/supabase'
import type {FamilyMember} from '@/db/types'

const avatarBucket = supabase.storage.from('avatars')

// 带内容哈希的固定路径避免覆盖和版本串用；本地 PNG 仅作为部署上传源。
export const AVATAR_MALE_URL = avatarBucket.getPublicUrl('defaults/avatar-male-1e8f1423eb6c.png').data.publicUrl
export const AVATAR_FEMALE_URL = avatarBucket.getPublicUrl('defaults/avatar-female-8ffc792d31b6.png').data.publicUrl

/**
 * 根据性别返回对应头像 URL
 * @param gender 成员性别字段值
 * @returns 头像图片 URL
 */
export function getAvatarByGender(gender?: string | null): string {
  return gender === 'female' ? AVATAR_FEMALE_URL : AVATAR_MALE_URL
}

export function getMemberAvatar(member?: Pick<FamilyMember, 'avatar_url' | 'gender'> | null): string {
  return member?.avatar_url || getAvatarByGender(member?.gender)
}
