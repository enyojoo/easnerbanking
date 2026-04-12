/**
 * Cached TOTP MFA "verified factor present" for the More row.
 * Persists until sign-out or explicit save after enable/disable — no TTL.
 * `bumpMfaRefreshGeneration` runs on save/clear so in-flight `listFactors` cannot overwrite fresh UI.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const storageKey = (userId: string) => `easner_mfa_verified_v1_${userId}`

type Snapshot = { userId: string; verified: boolean; at: number }

let memory: Snapshot | null = null

/**
 * Bumped when local MFA truth changes (`saveMfaVerified`) so in-flight `listFactors` work on
 * MoreScreen cannot apply a stale response after enroll/disable.
 */
let mfaRefreshGeneration = 0

/** In-memory only — cleared with `clearMfaVerified` so a new login always revalidates once. */
let lastListFactorsAt: { userId: string; at: number } | null = null

/** Minimum time between Supabase `listFactors` calls for the More row when we already have a saved snapshot. */
const LIST_FACTORS_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000

export function shouldListFactorsForMfaRow(userId: string): boolean {
  if (!lastListFactorsAt || lastListFactorsAt.userId !== userId) return true
  return Date.now() - lastListFactorsAt.at >= LIST_FACTORS_MIN_INTERVAL_MS
}

export function markMfaListFactorsCompleted(userId: string): void {
  lastListFactorsAt = { userId, at: Date.now() }
}

/** Invalidate in-flight More MFA refreshes; returns the new generation (for optional local refs). */
export function bumpMfaRefreshGeneration(): number {
  mfaRefreshGeneration += 1
  return mfaRefreshGeneration
}

export function getMfaRefreshGeneration(): number {
  return mfaRefreshGeneration
}

export function peekMfaVerified(userId: string): boolean | null {
  if (!memory || memory.userId !== userId) return null
  return memory.verified
}

export async function loadMfaVerifiedPersisted(userId: string): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId))
    if (!raw) return null
    const j = JSON.parse(raw) as { v?: boolean; at?: number }
    if (typeof j.v !== 'boolean' || typeof j.at !== 'number') return null
    memory = { userId, verified: j.v, at: j.at }
    return j.v
  } catch {
    return null
  }
}

export async function saveMfaVerified(userId: string, verified: boolean): Promise<void> {
  const at = Date.now()
  memory = { userId, verified, at }
  bumpMfaRefreshGeneration()
  markMfaListFactorsCompleted(userId)
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify({ v: verified, at }))
  } catch {
    // ignore
  }
}

/** Call on sign-out or when switching accounts so the next user is not shown stale MFA. */
export async function clearMfaVerified(userId: string | null | undefined): Promise<void> {
  memory = null
  lastListFactorsAt = null
  bumpMfaRefreshGeneration()
  if (!userId) return
  try {
    await AsyncStorage.removeItem(storageKey(userId))
  } catch {
    // ignore
  }
}
