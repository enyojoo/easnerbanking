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

const store = new Map<string, StoredEntry>()

function storageKey(tag: string): string {
  return `easenet_pp_v1:${tag}`
}

function readFromSessionStorage(tag: string): StoredEntry | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(storageKey(tag))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredEntry
    if (
      !parsed ||
      typeof parsed.storedAt !== "number" ||
      typeof parsed.fullName !== "string" ||
      (parsed.accountKind !== "business" && parsed.accountKind !== "personal")
    ) {
      sessionStorage.removeItem(storageKey(tag))
      return null
    }
    if (Date.now() - parsed.storedAt > TTL_MS) {
      sessionStorage.removeItem(storageKey(tag))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeToSessionStorage(tag: string, entry: StoredEntry): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(storageKey(tag), JSON.stringify(entry))
  } catch {
    // quota / private mode
  }
}

function removeFromSessionStorage(tag: string): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(storageKey(tag))
  } catch {
    // ignore
  }
}

export function readEasenetPublicProfileCache(rawTag: string): CachedEasenetPublicProfile | null {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return null
  let e = store.get(tag)
  if (!e) {
    e = readFromSessionStorage(tag)
    if (e) store.set(tag, e)
  }
  if (!e) return null
  if (Date.now() - e.storedAt > TTL_MS) {
    store.delete(tag)
    removeFromSessionStorage(tag)
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
  store.set(tag, entry)
  writeToSessionStorage(tag, entry)
}
