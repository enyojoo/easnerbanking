"use client"

import { useLayoutEffect } from "react"
import { beginIdleLockSuspend, endIdleLockSuspend } from "@/lib/session-activity"
import { setAppLocked } from "@/lib/login-pin"

/**
 * While `active`, keep the app idle PIN lock from firing.
 * Use for immersive flows where activity may not reach the parent window
 * (e.g. Stripe Connect onboarding iframe inside a dialog).
 */
export function useSuspendIdleLock(active: boolean, userId?: string | null): void {
  useLayoutEffect(() => {
    if (!active) return
    beginIdleLockSuspend()
    if (userId) setAppLocked(userId, false)
    return () => {
      endIdleLockSuspend()
    }
  }, [active, userId])
}
