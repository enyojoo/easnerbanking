import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { applyExpressFormDraft } from './expressSetupForm'

const DRAFT_KEY = 'express_setup_form_v1'
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

let memory: Record<string, string> | null = null

function stripSecrets(form: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(form)) {
    if (key === 'ssn') continue
    const trimmed = String(value || '').trim()
    if (trimmed) next[key] = trimmed
  }
  return next
}

function readWebDraft(): Record<string, string> | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: Record<string, string>; timestamp?: number }
    const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0
    if (!parsed.data || Date.now() - ts > DRAFT_MAX_AGE_MS) return null
    return stripSecrets(parsed.data)
  } catch {
    return null
  }
}

function writeDraft(form: Record<string, string>) {
  const data = stripSecrets(form)
  memory = data
  const payload = JSON.stringify({ data, timestamp: Date.now() })
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(DRAFT_KEY, payload)
    } catch {
      // ignore quota / private mode
    }
  }
  void AsyncStorage.setItem(DRAFT_KEY, payload).catch(() => undefined)
}

export function peekExpressSetupFormDraft(): Record<string, string> | null {
  if (memory) return memory
  const web = readWebDraft()
  if (web) {
    memory = web
    return web
  }
  return memory
}

export function persistExpressSetupFormDraft(form: Record<string, string>) {
  writeDraft({ ...(peekExpressSetupFormDraft() || {}), ...stripSecrets(form) })
}

export async function hydrateExpressSetupFormDraft(): Promise<Record<string, string> | null> {
  const peeked = peekExpressSetupFormDraft()
  if (peeked) return peeked
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY)
    if (!raw) return memory
    const parsed = JSON.parse(raw) as { data?: Record<string, string>; timestamp?: number }
    const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0
    if (!parsed.data || Date.now() - ts > DRAFT_MAX_AGE_MS) return memory
    memory = stripSecrets(parsed.data)
  } catch {
    // ignore
  }
  return memory
}

export function clearExpressSetupFormDraft() {
  memory = null
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      // ignore
    }
  }
  void AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined)
}

export function seedExpressSetupForm(
  base: Record<string, string>,
  draft?: Record<string, string> | null,
): Record<string, string> {
  return applyExpressFormDraft(base, draft ?? peekExpressSetupFormDraft())
}
