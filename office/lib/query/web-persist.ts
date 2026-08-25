"use client"

/**
 * Office deliberately does NOT persist react-query caches to localStorage:
 * admin data includes KYC and financial operations records, so query data is
 * memory-only for the session. What remains here is the cleanup path that
 * removes caches written by older releases (and clears state on sign-out).
 */

const OFFICE_WEB_QUERY_CACHE_KEY_PREFIX = "easner_office_query_cache_v1_"

/** Guards the full-localStorage sweep so it runs at most once per session. */
let sweepDoneThisSession = false

function removeLocalStorageKeys(keys: string[]) {
  if (typeof window === "undefined") return
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore quota / privacy mode errors
    }
  }
}

export function officeWebQueryCacheKey(userId: string): string {
  return `${OFFICE_WEB_QUERY_CACHE_KEY_PREFIX}${userId}`
}

export function clearPersistedOfficeQueryCache(userId?: string | null): void {
  if (typeof window === "undefined") return
  if (userId) {
    // Cheap direct removal – no localStorage iteration needed.
    removeLocalStorageKeys([officeWebQueryCacheKey(userId)])
    return
  }
  // Without a user id we have to scan every key for the office prefix.
  // That sweep only exists to clean up caches written by older releases,
  // so run it at most once per session.
  if (sweepDoneThisSession) return
  sweepDoneThisSession = true
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key && key.startsWith(OFFICE_WEB_QUERY_CACHE_KEY_PREFIX)) keys.push(key)
  }
  removeLocalStorageKeys(keys)
}

export function clearAllOfficeBrowserState(userId?: string | null): void {
  clearPersistedOfficeQueryCache(userId)
}
