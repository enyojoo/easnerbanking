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

/**
 * Activity is tracked in memory and flushed to localStorage at most every
 * ~10s (plus on hide/pagehide). `localStorage.setItem` is a synchronous,
 * main-thread, cross-tab-locking write — the old per-event write meant one
 * click paid for 3 writes (pointerdown + mousedown + focusin) BEFORE the
 * app's handler ran, and scrolling paid one per frame. The idle timeout is
 * minutes, so a ≤10s-stale cross-tab timestamp is indistinguishable.
 */
const FLUSH_INTERVAL_MS = 10_000

let suspendCount = 0
let heartbeatId: ReturnType<typeof setInterval> | null = null
let lastActivityMs = 0
let lastFlushedMs = 0
let flushListenersInstalled = false

function flushActivityToStorage(): void {
  if (typeof window === "undefined") return
  if (lastActivityMs <= lastFlushedMs) return
  try {
    localStorage.setItem(LS_KEY, String(lastActivityMs))
    lastFlushedMs = lastActivityMs
  } catch {
    // ignore
  }
}

function ensureFlushListeners(): void {
  if (flushListenersInstalled || typeof window === "undefined") return
  flushListenersInstalled = true
  window.addEventListener("pagehide", flushActivityToStorage)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushActivityToStorage()
  })
}

export function getLastActivityTimestamp(): number {
  if (typeof window === "undefined") return Date.now()
  let stored = 0
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw != null) {
      const n = parseInt(raw, 10)
      if (Number.isFinite(n)) stored = n
    }
  } catch {
    // ignore
  }
  const best = Math.max(lastActivityMs, stored)
  return best > 0 ? best : Date.now()
}

export function resetSessionActivity(): void {
  if (typeof window === "undefined") return
  lastActivityMs = Date.now()
  ensureFlushListeners()
  if (lastActivityMs - lastFlushedMs >= FLUSH_INTERVAL_MS) {
    flushActivityToStorage()
  }
}

export function touchSessionActivity(): void {
  resetSessionActivity()
}

/**
 * Idle clock starts on a real login / first hydrate, not on tab-visible
 * session recovery (Supabase also emits SIGNED_IN for that).
 */
export function shouldResetIdleOnAuthEvent(
  event: string,
  previousUserId: string | null,
  nextUserId: string | null,
): boolean {
  if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return false
  if (!nextUserId) return false
  return previousUserId !== nextUserId
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
