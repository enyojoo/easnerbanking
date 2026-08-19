import { normalizeEasetag } from "@/lib/easetag-validation"
import { normalizeProfileImageUrl } from "@/lib/image-cache"
import type { PayeeAccountKind } from "@/lib/easner-brand"

export type CachedEasenetPublicProfile = {
  avatarUrl: string | null
  fullName: string
  accountKind: PayeeAccountKind
}

type StoredEntry = CachedEasenetPublicProfile & { storedAt: number }

/** Keep snapshots long enough that pickers feel instant; hydrated rows still revalidate in the background. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000

const store = new Map<string, StoredEntry>()

function storageKey(tag: string): string {
  return `easenet_pp_v2:${tag}`
}

function readFromLocalStorage(tag: string): StoredEntry | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(storageKey(tag))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredEntry
    if (
      !parsed ||
      typeof parsed.storedAt !== "number" ||
      typeof parsed.fullName !== "string" ||
      (parsed.accountKind !== "business" && parsed.accountKind !== "personal")
    ) {
      localStorage.removeItem(storageKey(tag))
      return null
    }
    if (Date.now() - parsed.storedAt > TTL_MS) {
      localStorage.removeItem(storageKey(tag))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeToLocalStorage(tag: string, entry: StoredEntry): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(storageKey(tag), JSON.stringify(entry))
  } catch {
    // quota / private mode
  }
}

function removeFromLocalStorage(tag: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(storageKey(tag))
  } catch {
    // ignore
  }
}

export function readEasenetPublicProfileCache(rawTag: string): CachedEasenetPublicProfile | null {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return null
  let e: StoredEntry | undefined = store.get(tag)
  if (!e) {
    const fromLs = readFromLocalStorage(tag)
    if (fromLs) {
      store.set(tag, fromLs)
      e = fromLs
    }
  }
  if (!e) return null
  if (Date.now() - e.storedAt > TTL_MS) {
    store.delete(tag)
    removeFromLocalStorage(tag)
    return null
  }
  return {
    avatarUrl: normalizeProfileImageUrl(e.avatarUrl),
    fullName: e.fullName,
    accountKind: e.accountKind,
  }
}

export function writeEasenetPublicProfileCache(rawTag: string, data: CachedEasenetPublicProfile): void {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return
  const entry: StoredEntry = {
    avatarUrl: normalizeProfileImageUrl(data.avatarUrl),
    fullName: data.fullName,
    accountKind: data.accountKind,
    storedAt: Date.now(),
  }
  store.set(tag, entry)
  writeToLocalStorage(tag, entry)
}

export function invalidateEasenetPublicProfileCache(rawTag: string): void {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return
  store.delete(tag)
  removeFromLocalStorage(tag)
}
