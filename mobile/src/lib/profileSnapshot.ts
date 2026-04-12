/**
 * Last-known `AuthUser` snapshot for instant UI on cold start / resume (avatar, KYC fields).
 * Plaintext on device — same sensitivity as session; cleared on logout.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthUser } from '../types'

const key = (userId: string) => `easner_profile_snapshot_v1_${userId}`

export async function readProfileSnapshot(userId: string): Promise<AuthUser | null> {
  if (!userId) return null
  try {
    const raw = await AsyncStorage.getItem(key(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthUser
    if (!parsed?.id || parsed.id !== userId) return null
    return parsed
  } catch {
    return null
  }
}

export async function writeProfileSnapshot(profile: AuthUser): Promise<void> {
  if (!profile?.id) return
  try {
    await AsyncStorage.setItem(key(profile.id), JSON.stringify(profile))
  } catch (e) {
    console.warn('[profileSnapshot] write failed', e)
  }
}

export async function clearProfileSnapshot(userId: string | null | undefined): Promise<void> {
  if (!userId) return
  try {
    await AsyncStorage.removeItem(key(userId))
  } catch {
    // ignore
  }
}
