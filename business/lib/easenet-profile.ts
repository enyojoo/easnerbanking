"use client"

import { fetchWithSession } from "@/lib/fetch-with-session"
import { normalizeEasetag } from "@/lib/easetag-validation"

export type EasenetPublicProfile = {
  found: true
  easetag: string
  fullName: string
  avatarUrl: string | null
}

export async function fetchEasenetProfileByTag(rawTag: string): Promise<EasenetPublicProfile | { found: false; reason?: string }> {
  const clean = normalizeEasetag(String(rawTag || "").trim())
  if (clean.length < 4) {
    return { found: false }
  }
  const res = await fetchWithSession(`/api/users/public-by-easetag?easetag=${encodeURIComponent(clean)}`)
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    found?: boolean
    reason?: string
    easetag?: string
    fullName?: string
    avatarUrl?: string | null
  }
  if (!res.ok || !data.found) {
    return { found: false, reason: data.reason }
  }
  return {
    found: true,
    easetag: String(data.easetag || clean),
    fullName: String(data.fullName || clean),
    avatarUrl: data.avatarUrl ?? null,
  }
}
