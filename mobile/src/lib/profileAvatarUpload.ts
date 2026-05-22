/**
 * Upload profile photo via business app — `POST /api/upload/profile-avatar`.
 * Uses JSON + base64 (reliable from React Native); web uses multipart FormData.
 */

import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from './supabase'
import { getApiBaseUrl } from './apiClient'
import { fileToBase64 } from './fileUtils'

/** Aligned with `business/lib/upload-constants.ts` */
export const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024

export type UploadProfileAvatarResult = { url: string } | { error: string }

/**
 * @param file - Expo image picker asset: use `uri`, and set `name` / `mimeType` when available
 */
export async function uploadProfileAvatar(file: {
  uri: string
  name?: string | null
  mimeType?: string | null
}): Promise<UploadProfileAvatarResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      return { error: 'Sign in to upload.' }
    }

    const apiBase = getApiBaseUrl()
    const mime = 'image/jpeg' as const

    let uploadUri = file.uri
    try {
      const normalized = await ImageManipulator.manipulateAsync(file.uri, [], {
        compress: 0.88,
        format: ImageManipulator.SaveFormat.JPEG,
      })
      uploadUri = normalized.uri
    } catch {
      return { error: 'Could not process the image. Try another photo.' }
    }

    const imageBase64 = await fileToBase64(uploadUri)
    const estimatedBytes = Math.ceil((imageBase64.length * 3) / 4)
    if (estimatedBytes > PROFILE_AVATAR_MAX_BYTES) {
      return { error: 'Photo must be 2MB or smaller.' }
    }

    const res = await fetch(`${apiBase}/api/upload/profile-avatar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64, mimeType: mime }),
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Network request failed') || msg.includes('fetch')) {
      return { error: 'Could not reach the server. Check your connection and try again.' }
    }
    return { error: msg || 'Upload failed.' }
  }
}
