/**
 * Upload profile photo via business app — same as web `POST /api/upload/profile-avatar`.
 */

import { supabase } from './supabase'
import { getApiBaseUrl } from './apiClient'

/** Aligned with `business/lib/upload-constants.ts` */
export const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export type UploadProfileAvatarResult = { url: string } | { error: string }

/**
 * @param file - Expo image picker asset: use `uri`, and set `name` / `mimeType` when available
 */
export async function uploadProfileAvatar(file: {
  uri: string
  name?: string | null
  mimeType?: string | null
}): Promise<UploadProfileAvatarResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { error: 'Sign in to upload.' }
  }

  const apiBase = getApiBaseUrl()
  if (!apiBase) {
    return { error: 'App API URL is not configured.' }
  }

  const mime = file.mimeType && ALLOWED_MIME.has(file.mimeType) ? file.mimeType : 'image/jpeg'
  const ext =
    mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg'
  const filename = file.name?.replace(/[^\w.-]/g, '_') || `avatar.${ext}`

  const form = new FormData()
  form.append('file', {
    uri: file.uri,
    name: filename,
    type: mime,
  } as unknown as Blob)

  const res = await fetch(`${apiBase}/api/upload/profile-avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: form,
  })

  const text = await res.text()
  let json: { url?: string; error?: string } = {}
  try {
    if (text) json = JSON.parse(text) as { url?: string; error?: string }
  } catch {
    return { error: text || 'Upload failed.' }
  }

  if (!res.ok) {
    return { error: json.error || `Upload failed (${res.status}).` }
  }
  if (!json.url) {
    return { error: 'Upload failed.' }
  }
  return { url: json.url }
}
