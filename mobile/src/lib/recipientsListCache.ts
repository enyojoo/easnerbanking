import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Recipient } from '../types'

const RECIPIENTS_CACHE_KEY_PREFIX = 'easner_recipients_list_v1_'
export const RECIPIENTS_CACHE_TTL_MS = 60 * 60 * 1000

type RecipientsCacheEnvelope = {
  at: number
  rows: Recipient[]
}

export async function loadRecipientsListCache(userId: string): Promise<Recipient[]> {
  if (!userId) return []
  try {
    const raw = await AsyncStorage.getItem(`${RECIPIENTS_CACHE_KEY_PREFIX}${userId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecipientsCacheEnvelope | null
    const at = Number(parsed?.at ?? 0)
    const rows = Array.isArray(parsed?.rows) ? parsed?.rows : []
    if (!Number.isFinite(at) || Date.now() - at > RECIPIENTS_CACHE_TTL_MS) return []
    return rows
  } catch {
    return []
  }
}

export async function saveRecipientsListCache(userId: string, rows: Recipient[]): Promise<void> {
  if (!userId || rows.length === 0) return
  const payload: RecipientsCacheEnvelope = {
    at: Date.now(),
    rows: rows.slice(0, 300),
  }
  try {
    await AsyncStorage.setItem(`${RECIPIENTS_CACHE_KEY_PREFIX}${userId}`, JSON.stringify(payload))
  } catch {
    // Best-effort cache write.
  }
}
