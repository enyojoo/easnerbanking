/**
 * Last-known `AuthUser` snapshot for instant UI on cold start / resume (avatar, KYC fields).
 * Plaintext on device — same sensitivity as session; cleared on logout.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthUser } from '../types'

const key = (userId: string) => `easner_profile_snapshot_v1_${userId}`

/** In-process cache so remounts (PIN re-lock) and duplicate auth events skip AsyncStorage. */
const memoryByUserId = new Map<string, AuthUser>()

export function peekProfileSnapshot(userId: string): AuthUser | null {
  if (!userId) return null
  const mem = memoryByUserId.get(userId)
  if (!mem?.id || mem.id !== userId) return null
  return mem
}

function rememberProfileSnapshot(profile: AuthUser): void {
  if (profile?.id) memoryByUserId.set(profile.id, profile)
}

export async function readProfileSnapshot(userId: string): Promise<AuthUser | null> {
  if (!userId) return null
  const cached = peekProfileSnapshot(userId)
  if (cached) return cached
  try {
    const raw = await AsyncStorage.getItem(key(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthUser
    if (!parsed?.id || parsed.id !== userId) return null
    rememberProfileSnapshot(parsed)
    return parsed
  } catch {
    return null
  }
}

export async function writeProfileSnapshot(profile: AuthUser): Promise<void> {
  if (!profile?.id) return
  rememberProfileSnapshot(profile)
  try {
    await AsyncStorage.setItem(key(profile.id), JSON.stringify(profile))
  } catch (e) {
    console.warn('[profileSnapshot] write failed', e)
  }
}

export async function clearProfileSnapshot(userId: string | null | undefined): Promise<void> {
  if (!userId) return
  memoryByUserId.delete(userId)
  try {
    await AsyncStorage.removeItem(key(userId))
  } catch {
    // ignore
  }
}
