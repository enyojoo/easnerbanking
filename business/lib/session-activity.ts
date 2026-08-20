/**
 * Tracks last user activity for idle soft-lock. Separate from Supabase session refresh.
 *
 * Cross-origin iframes (e.g. Stripe Connect onboarding) do not bubble pointer/keyboard
 * events to the parent window. Callers can suspend idle enforcement while those UIs are open;
 * a heartbeat keeps last-activity fresh so the PIN lock does not interrupt mid-flow.
 */

const LS_KEY = "easner_business_last_activity_ms"

/** Heartbeat while idle lock is suspended (must be well under APP_IDLE_TIMEOUT). */
const SUSPEND_HEARTBEAT_MS = 30_000

let suspendCount = 0
let heartbeatId: ReturnType<typeof setInterval> | null = null

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

export function isIdleLockSuspended(): boolean {
  return suspendCount > 0
}

function ensureHeartbeat(): void {
  if (typeof window === "undefined") return
  if (heartbeatId != null) return
  touchSessionActivity()
  heartbeatId = window.setInterval(() => {
    if (suspendCount > 0) touchSessionActivity()
  }, SUSPEND_HEARTBEAT_MS)
}

function clearHeartbeat(): void {
  if (heartbeatId == null) return
  if (typeof window !== "undefined") window.clearInterval(heartbeatId)
  heartbeatId = null
}

/**
 * Pause idle soft-lock while the user is in an immersive flow that may not emit
 * parent-window activity (dialogs with cross-origin iframes, etc.).
 * Reference-counted – pair every begin with end.
 */
export function beginIdleLockSuspend(): void {
  suspendCount += 1
  touchSessionActivity()
  ensureHeartbeat()
}

export function endIdleLockSuspend(): void {
  suspendCount = Math.max(0, suspendCount - 1)
  touchSessionActivity()
  if (suspendCount === 0) clearHeartbeat()
}

/** Test helper – resets in-memory suspend state. */
export function __resetIdleLockSuspendForTests(): void {
  suspendCount = 0
  clearHeartbeat()
}
