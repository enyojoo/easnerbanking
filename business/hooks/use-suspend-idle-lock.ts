"use client"

import { useEffect } from "react"
import { beginIdleLockSuspend, endIdleLockSuspend } from "@/lib/session-activity"

/**
 * While `active`, keep the app idle PIN lock from firing.
 * Use for immersive flows where activity may not reach the parent window
 * (e.g. Stripe Connect onboarding iframe inside a dialog).
 */
export function useSuspendIdleLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    beginIdleLockSuspend()
    return () => {
      endIdleLockSuspend()
    }
  }, [active])
}
