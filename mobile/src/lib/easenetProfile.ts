import { getApiBaseUrl } from './apiClient'
import { supabase } from './supabase'

export type EasenetPublicProfile =
  | { found: true; easetag: string; fullName: string; avatarUrl: string | null }
  | { found: false; reason?: string }

/**
 * Authenticated lookup against business `/api/users/public-by-easetag` (Bearer).
 */
export async function fetchEasenetPublicProfile(rawTag: string): Promise<EasenetPublicProfile> {
  const clean = String(rawTag || '')
    .trim()
    .replace(/^@+/, '')
  if (clean.length < 4) {
    return { found: false }
  }
  const base = getApiBaseUrl()
  if (!base) {
    return { found: false }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { found: false }
  }
  const url = `${base}/api/users/public-by-easetag?easetag=${encodeURIComponent(clean)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
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
    fullName: String(data.fullName || clean).trim() || clean,
    avatarUrl: data.avatarUrl ?? null,
  }
}
