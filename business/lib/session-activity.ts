/**
 * Tracks last user activity for idle soft-lock. Separate from Supabase session refresh.
 */

const LS_KEY = "easner_business_last_activity_ms"

export function getLastActivityTimestamp(): number {
  if (typeof window === "undefined") return Date.now()
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw == null) return Date.now()
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : Date.now()
  } catch {
    return Date.now()
  }
}

export function resetSessionActivity(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(LS_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

export function touchSessionActivity(): void {
  resetSessionActivity()
}
