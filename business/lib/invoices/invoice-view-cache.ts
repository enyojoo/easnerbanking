import type { PublicInvoicePayload } from "@/lib/invoices/json-public-invoice-from-row"

const SESSION_PREFIX = "easner:invoice-view:session:"
const LOCAL_PREFIX = "easner:invoice-view:local:"

/** Persist display data across tab closes; background refresh keeps it current. */
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000

export type CachedInvoiceView = PublicInvoicePayload & {
  cachedAt: number
}

export type InvoiceViewCacheScope = "public" | "preview"

export function invoiceViewCacheKey(scope: InvoiceViewCacheScope, key: string): string {
  return `${scope}:${key}`
}

function sessionStorageKey(cacheKey: string): string {
  return `${SESSION_PREFIX}${cacheKey}`
}

function localStorageKey(cacheKey: string): string {
  return `${LOCAL_PREFIX}${cacheKey}`
}

function parseEntry(raw: string): CachedInvoiceView | null {
  try {
    const parsed = JSON.parse(raw) as CachedInvoiceView
    if (!parsed?.invoice || typeof parsed.cachedAt !== "number") return null
    return parsed
  } catch {
    return null
  }
}

function readFromStore(
  store: Storage,
  key: string,
  maxAgeMs?: number,
): CachedInvoiceView | null {
  const raw = store.getItem(key)
  if (!raw) return null
  const parsed = parseEntry(raw)
  if (!parsed) return null
  if (maxAgeMs != null && Date.now() - parsed.cachedAt > maxAgeMs) {
    store.removeItem(key)
    return null
  }
  return parsed
}

/** Session cache first, then localStorage within TTL — instant revisit UX. */
export function readCachedInvoiceView(cacheKey: string): CachedInvoiceView | null {
  if (!cacheKey || typeof window === "undefined") return null
  try {
    const fromSession = readFromStore(sessionStorage, sessionStorageKey(cacheKey))
    if (fromSession) return fromSession

    const fromLocal = readFromStore(localStorage, localStorageKey(cacheKey), LOCAL_TTL_MS)
    if (fromLocal) {
      return { ...fromLocal, stripeCheckout: null }
    }
    return null
  } catch {
    return null
  }
}

export function writeCachedInvoiceView(
  cacheKey: string,
  payload: PublicInvoicePayload,
): void {
  if (!cacheKey || typeof window === "undefined") return
  // Stripe checkout sessions expire — never cache clientSecret; always fetch fresh on Pay online.
  const entry: CachedInvoiceView = {
    ...payload,
    stripeCheckout: null,
    cachedAt: Date.now(),
  }
  const serialized = JSON.stringify(entry)
  try {
    sessionStorage.setItem(sessionStorageKey(cacheKey), serialized)
  } catch {
    // ignore quota / private mode
  }
  try {
    localStorage.setItem(localStorageKey(cacheKey), serialized)
  } catch {
    // ignore quota / private mode
  }
}

export function clearCachedInvoiceView(cacheKey: string): void {
  if (!cacheKey || typeof window === "undefined") return
  try {
    sessionStorage.removeItem(sessionStorageKey(cacheKey))
    localStorage.removeItem(localStorageKey(cacheKey))
  } catch {
    // ignore
  }
}
