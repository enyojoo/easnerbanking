import { evaluateIdlePolicy } from "@/lib/app-idle-policy"
import { hasPin, isAppLocked, isLoginPinModuleAvailable } from "@/lib/login-pin"
import { probeStoredSupabaseSession } from "@/lib/query/web-persist"

export type PinGate = "pending" | "open" | "lock" | "setup"

export function resolveBootUserId(
  userId: string | null | undefined,
  sessionUserId: string | null | undefined,
): string | null {
  if (userId) return userId
  if (sessionUserId) return sessionUserId
  if (typeof window === "undefined") return null
  const probe = probeStoredSupabaseSession()
  return probe.likelyAuthenticated ? probe.userId : null
}

export function resolvePinGate(userId: string | null): PinGate {
  if (!userId) return "open"
  if (!isLoginPinModuleAvailable()) return "open"
  if (!hasPin(userId)) return "setup"
  if (isAppLocked(userId) || evaluateIdlePolicy(userId) === "lock") return "lock"
  return "open"
}

/** First client paint: lock/setup/open when storage is readable. Avoids pending→PIN flicker. */
export function readInitialPinState(
  userId?: string | null,
  sessionUserId?: string | null,
): { gate: PinGate; userId: string | null } {
  if (typeof window === "undefined") return { gate: "pending", userId: null }
  const uid = resolveBootUserId(userId, sessionUserId)
  if (!uid) return { gate: "pending", userId: null }
  return { gate: resolvePinGate(uid), userId: uid }
}

export function isPinBlockingWorkspace(userId: string | null | undefined): boolean {
  if (!userId) return false
  const gate = resolvePinGate(userId)
  return gate === "lock" || gate === "setup"
}
