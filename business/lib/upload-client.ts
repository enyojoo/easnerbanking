"use client"

import { UPLOAD_MAX_BYTES } from "@/lib/upload-constants"

export type UploadProfileAvatarResult = { url: string } | { error: string }
export type UploadOrgLogoResult = { url: string } | { error: string }

export async function uploadProfileAvatar(
  file: File,
  accessToken: string,
): Promise<UploadProfileAvatarResult> {
  if (file.size > UPLOAD_MAX_BYTES) {
    return { error: `Image must be ${UPLOAD_MAX_BYTES / (1024 * 1024)}MB or smaller.` }
  }
  const form = new FormData()
  form.append("file", file)
  const res = await fetch("/api/upload/profile-avatar", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  const json = (await res.json()) as { url?: string; error?: string }
  if (!res.ok) return { error: json.error ?? "Upload failed." }
  if (!json.url) return { error: "Upload failed." }
  return { url: json.url }
}

export async function uploadOrganizationLogo(
  file: File,
  accessToken: string,
): Promise<UploadOrgLogoResult> {
  if (file.size > UPLOAD_MAX_BYTES) {
    return { error: `Image must be ${UPLOAD_MAX_BYTES / (1024 * 1024)}MB or smaller.` }
  }
  const form = new FormData()
  form.append("file", file)
  const res = await fetch("/api/upload/organization-logo", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  const json = (await res.json()) as { url?: string; error?: string }
  if (!res.ok) return { error: json.error ?? "Upload failed." }
  if (!json.url) return { error: "Upload failed." }
  return { url: json.url }
}
