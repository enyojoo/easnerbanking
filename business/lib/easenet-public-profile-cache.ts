import { normalizeEasetag } from "@/lib/easetag-validation"
import type { PayeeAccountKind } from "@/lib/easner-brand"

export type CachedEasenetPublicProfile = {
  avatarUrl: string | null
  fullName: string
  accountKind: PayeeAccountKind
}

type StoredEntry = CachedEasenetPublicProfile & { storedAt: number }

/** Keep snapshots long enough that reopening pickers feels instant; still refreshes eventually. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

const LS_PREFIX = "easner_easenet_pub_v1_"

const memory = new Map<string, StoredEntry>()

const listeners = new Set<() => void>()

/** Stable object refs for useSyncExternalStore (must not return a new object each render when data is unchanged). */
const snapshotKeyByTag = new Map<string, string>()
const snapshotRefByTag = new Map<string, CachedEasenetPublicProfile | null>()

function notify() {
  listeners.forEach((l) => l())
}

function readLs(tag: string): StoredEntry | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + tag)
    if (!raw) return null
    const e = JSON.parse(raw) as StoredEntry
    if (Date.now() - e.storedAt > TTL_MS) {
      window.localStorage.removeItem(LS_PREFIX + tag)
      return null
    }
    return e
  } catch {
    return null
  }
}

function writeLs(tag: string, entry: StoredEntry): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LS_PREFIX + tag, JSON.stringify(entry))
  } catch {
    // quota / private mode
  }
}

function deleteLs(tag: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(LS_PREFIX + tag)
  } catch {
    /* ignore */
  }
}

function isFresh(e: StoredEntry): boolean {
  return Date.now() - e.storedAt <= TTL_MS
}

function getEntry(tag: string): StoredEntry | null {
  const mem = memory.get(tag)
  if (mem && isFresh(mem)) return mem
  if (mem) memory.delete(tag)

  const fromLs = readLs(tag)
  if (fromLs && isFresh(fromLs)) {
    memory.set(tag, fromLs)
    return fromLs
  }
  return null
}

export function readEasenetPublicProfileCache(rawTag: string): CachedEasenetPublicProfile | null {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return null
  const e = getEntry(tag)
  if (!e) return null
  if (!isFresh(e)) {
    memory.delete(tag)
    deleteLs(tag)
    return null
  }
  return {
    avatarUrl: e.avatarUrl,
    fullName: e.fullName,
    accountKind: e.accountKind,
  }
}

export function writeEasenetPublicProfileCache(rawTag: string, data: CachedEasenetPublicProfile): void {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return
  const entry: StoredEntry = { ...data, storedAt: Date.now() }
  memory.set(tag, entry)
  writeLs(tag, entry)
  snapshotKeyByTag.delete(tag)
  snapshotRefByTag.delete(tag)
  notify()
}

export function subscribeEasenetPublicProfileCache(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

export function getEasenetPublicProfileCacheSnapshot(rawTag: string): CachedEasenetPublicProfile | null {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return null
  const data = readEasenetPublicProfileCache(rawTag)
  const key = data
    ? `${data.avatarUrl ?? ""}|${data.fullName}|${data.accountKind}`
    : "null"
  if (snapshotKeyByTag.get(tag) === key) {
    return snapshotRefByTag.get(tag) ?? null
  }
  snapshotKeyByTag.set(tag, key)
  snapshotRefByTag.set(tag, data)
  return data
}
