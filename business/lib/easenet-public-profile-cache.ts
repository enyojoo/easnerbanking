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

export function readEasenetPublicProfileCache(rawTag: string): CachedEasenetPublicProfile | null {
  const tag = normalizeEasetag(String(rawTag || "").trim())
  if (!tag) return null
  const e = store.get(tag)
  if (!e) return null
  if (Date.now() - e.storedAt > TTL_MS) {
    store.delete(tag)
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
  store.set(tag, { ...data, storedAt: Date.now() })
}
