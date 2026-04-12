"use client"

import { useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { emitAppLocked } from "@/lib/app-lock-bus"
import { APP_IDLE_CHECK_INTERVAL_MS, APP_IDLE_TIMEOUT_MINUTES } from "@/lib/app-lock-config"
import { hasPin, isLoginPinModuleAvailable, removePin, setAppLocked } from "@/lib/login-pin"
import { getLastActivityTimestamp, touchSessionActivity } from "@/lib/session-activity"

/**
 * Tracks activity and enforces idle soft-lock (PIN) or sign-out (no PIN).
 */
export function IdleSessionBridge() {
  const { user, logout } = useAuth()

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    const uid = user.id

    const tick = () => {
      const last = getLastActivityTimestamp()
      const idleMs = Date.now() - last
      const limit = APP_IDLE_TIMEOUT_MINUTES * 60 * 1000
      if (idleMs <= limit) return

      if (!isLoginPinModuleAvailable()) {
        void logout()
        return
      }
      if (hasPin(uid)) {
        setAppLocked(uid, true)
        emitAppLocked()
      } else {
        void logout()
      }
    }

    const id = window.setInterval(tick, APP_IDLE_CHECK_INTERVAL_MS)
    const onAct = () => touchSessionActivity()
    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener("mousedown", onAct, opts)
    window.addEventListener("keydown", onAct, opts)
    window.addEventListener("scroll", onAct, opts)
    window.addEventListener("touchstart", onAct, opts)
    window.addEventListener("pointerdown", onAct, opts)
    window.addEventListener("focusin", onAct, opts)

    return () => {
      window.clearInterval(id)
      window.removeEventListener("mousedown", onAct, opts)
      window.removeEventListener("keydown", onAct, opts)
      window.removeEventListener("scroll", onAct, opts)
      window.removeEventListener("touchstart", onAct, opts)
      window.removeEventListener("pointerdown", onAct, opts)
      window.removeEventListener("focusin", onAct, opts)
    }
  }, [user?.id, logout])

  return null
}
