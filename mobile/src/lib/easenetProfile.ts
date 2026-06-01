import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApiBaseUrl } from './apiClient'
import { supabase } from './supabase'
import type { PayeeAccountKind } from './easnerBrand'
import { normalizeAvatarUrl } from './avatarCache'
import { prefetchImageUri } from './imageCache'

export type EasenetPublicProfile =
  | { found: true; easetag: string; fullName: string; avatarUrl: string | null; accountKind: PayeeAccountKind }
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
    accountKind?: string
  }
  if (!res.ok || !data.found) {
    return { found: false, reason: data.reason }
  }
  const accountKind: PayeeAccountKind = data.accountKind === 'business' ? 'business' : 'personal'
  const profile: Extract<EasenetPublicProfile, { found: true }> = {
    found: true,
    easetag: String(data.easetag || clean),
    fullName: String(data.fullName || clean).trim() || clean,
    avatarUrl: data.avatarUrl ?? null,
    accountKind,
  }
  // Warm image cache to avoid avatar "misses" between screens.
  await prefetchImageUri(normalizeAvatarUrl(profile.avatarUrl))
  return profile
}

/** In-memory: avoid re-reading disk on every navigation in the same session. */
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000
/** AsyncStorage: survive app restarts; refreshed when stale. */
const DISK_TTL_MS = 30 * 24 * 60 * 60 * 1000

const PERSIST_KEY_PREFIX = 'easner_easenet_public_profile_v1_'

const cachedProfiles = new Map<string, { at: number; value: EasenetPublicProfile }>()
const inflightRevalidations = new Map<string, Promise<EasenetPublicProfile>>()
const profileListeners = new Map<string, Set<(profile: EasenetPublicProfile) => void>>()

function cacheKeyForEasetag(rawTag: string): string {
  return String(rawTag || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
}

function notifyProfileListeners(key: string, profile: EasenetPublicProfile): void {
  const listeners = profileListeners.get(key)
  if (!listeners) return
  for (const listener of listeners) {
    listener(profile)
  }
}

async function storeEasenetProfile(key: string, value: EasenetPublicProfile): Promise<void> {
  cachedProfiles.set(key, { at: Date.now(), value })
  if (value.found) {
    await writePersistedEasenetProfile(key, value)
    await prefetchImageUri(normalizeAvatarUrl(value.avatarUrl))
  }
  notifyProfileListeners(key, value)
}

/** Subscribe to background revalidation updates for a tag (SWR). */
export function subscribeEasenetPublicProfile(
  rawTag: string,
  listener: (profile: EasenetPublicProfile) => void,
): () => void {
  const key = cacheKeyForEasetag(rawTag)
  if (key.length < 4) return () => {}
  let set = profileListeners.get(key)
  if (!set) {
    set = new Set()
    profileListeners.set(key, set)
  }
  set.add(listener)
  return () => {
    set!.delete(listener)
    if (set!.size === 0) profileListeners.delete(key)
  }
}

/** Synchronous read of the in-memory Easenet profile cache (same TTL as {@link fetchEasenetPublicProfileCached}). */
export function peekEasenetPublicProfileMemory(rawTag: string): EasenetPublicProfile | null {
  const key = cacheKeyForEasetag(rawTag)
  if (key.length < 4) return null
  const mem = cachedProfiles.get(key)
  if (mem && Date.now() - mem.at < MEMORY_TTL_MS) {
    return mem.value
  }
  return null
}

function persistStorageKey(normalizedTag: string): string {
  return `${PERSIST_KEY_PREFIX}${normalizedTag}`
}

async function readPersistedEasenetProfile(normalizedTag: string): Promise<EasenetPublicProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(persistStorageKey(normalizedTag))
    if (!raw) return null
    const env = JSON.parse(raw) as { data: EasenetPublicProfile; timestamp: number }
    if (Date.now() - env.timestamp > DISK_TTL_MS) {
      await AsyncStorage.removeItem(persistStorageKey(normalizedTag))
      return null
    }
    if (!env.data || !('found' in env.data) || !env.data.found) {
      return null
    }
    return env.data
  } catch {
    return null
  }
}

async function writePersistedEasenetProfile(normalizedTag: string, value: Extract<EasenetPublicProfile, { found: true }>): Promise<void> {
  try {
    await AsyncStorage.setItem(
      persistStorageKey(normalizedTag),
      JSON.stringify({
        data: value,
        timestamp: Date.now(),
      }),
    )
  } catch {
    // ignore
  }
}

/**
 * Prime cache from an already-saved recipient snapshot so avatar/kind can render instantly
 * while network refresh happens in the background.
 */
export async function primeEasenetPublicProfileCache(
  rawTag: string,
  snapshot: { fullName?: string | null; avatarUrl?: string | null; accountKind?: PayeeAccountKind | null },
): Promise<void> {
  const key = cacheKeyForEasetag(rawTag)
  if (key.length < 4) return
  if (snapshot.accountKind !== 'business' && snapshot.accountKind !== 'personal') return
  const fullName = String(snapshot.fullName || '').trim()
  if (!fullName) return
  const value: Extract<EasenetPublicProfile, { found: true }> = {
    found: true,
    easetag: key,
    fullName,
    avatarUrl: snapshot.avatarUrl?.trim() || null,
    accountKind: snapshot.accountKind,
  }
  await storeEasenetProfile(key, value)
}

/**
 * Force network refresh, update caches, and notify subscribers.
 */
export async function revalidateEasenetPublicProfile(rawTag: string): Promise<EasenetPublicProfile> {
  const key = cacheKeyForEasetag(rawTag)
  if (key.length < 4) {
    return { found: false }
  }

  const pending = inflightRevalidations.get(key)
  if (pending) return pending

  const promise = fetchEasenetPublicProfile(key)
    .then(async (value) => {
      await storeEasenetProfile(key, value)
      inflightRevalidations.delete(key)
      return value
    })
    .catch((error) => {
      inflightRevalidations.delete(key)
      throw error
    })

  inflightRevalidations.set(key, promise)
  return promise
}

/**
 * Non-blocking warmup: show cached profiles instantly, revalidate every tag in the background.
 */
export async function warmEasenetPublicProfiles(rawTags: string[]): Promise<void> {
  const unique = Array.from(
    new Set(
      (rawTags || [])
        .map((tag) => cacheKeyForEasetag(tag))
        .filter((tag) => tag.length >= 4),
    ),
  )
  await Promise.allSettled(unique.map((tag) => fetchEasenetPublicProfileCached(tag)))
}

/** Clears persisted Easenet public lookups (e.g. on logout). */
export async function clearEasenetPublicProfileCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const toRemove = keys.filter((k) => k.startsWith(PERSIST_KEY_PREFIX))
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove)
    }
    cachedProfiles.clear()
    profileListeners.clear()
  } catch {
    // ignore
  }
}

/**
 * Stale-while-revalidate:
 * - returns memory/disk cache immediately when available
 * - always kicks off a background network refresh (deduped)
 * - cold miss blocks until the first fetch completes
 */
export async function fetchEasenetPublicProfileCached(rawTag: string): Promise<EasenetPublicProfile> {
  const key = cacheKeyForEasetag(rawTag)
  if (key.length < 4) {
    return { found: false }
  }

  const mem = cachedProfiles.get(key)
  if (mem && Date.now() - mem.at < MEMORY_TTL_MS) {
    void revalidateEasenetPublicProfile(key).catch(() => {})
    return mem.value
  }

  const disk = await readPersistedEasenetProfile(key)
  if (disk?.found) {
    cachedProfiles.set(key, { at: Date.now(), value: disk })
    void revalidateEasenetPublicProfile(key).catch(() => {})
    return disk
  }

  return revalidateEasenetPublicProfile(key)
}
