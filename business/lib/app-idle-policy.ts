import { emitAppLocked } from "@/lib/app-lock-bus"
import { APP_IDLE_TIMEOUT_MINUTES } from "@/lib/app-lock-config"
import { hasPin, isLoginPinModuleAvailable, setAppLocked } from "@/lib/login-pin"
import { getLastActivityTimestamp } from "@/lib/session-activity"

export type IdlePolicyAction = "ok" | "lock" | "logout"

/** Read-only idle evaluation (safe during render). */
export function evaluateIdlePolicy(userId: string, now = Date.now()): IdlePolicyAction {
  const last = getLastActivityTimestamp()
  const idleMs = now - last
  const limit = APP_IDLE_TIMEOUT_MINUTES * 60 * 1000
  if (idleMs <= limit) return "ok"

  if (!isLoginPinModuleAvailable()) return "logout"
  if (hasPin(userId)) return "lock"
  return "logout"
}

/** Apply soft-lock when idle exceeded; returns whether caller should sign out. */
export function applyIdlePolicy(userId: string, now = Date.now()): IdlePolicyAction {
  const action = evaluateIdlePolicy(userId, now)
  if (action === "lock") {
    setAppLocked(userId, true)
    emitAppLocked()
  }
  return action
}
