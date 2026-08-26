"use client"

import { useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { applyIdlePolicy } from "@/lib/app-idle-policy"
import { APP_IDLE_CHECK_INTERVAL_MS } from "@/lib/app-lock-config"
import { isAppLocked } from "@/lib/login-pin"
import { touchSessionActivity } from "@/lib/session-activity"

/**
 * Tracks activity and enforces idle soft-lock (PIN) or sign-out (no PIN).
 * Evaluates immediately on mount and when the tab becomes visible again so a
 * closed tab cannot bypass lock by restoring a Supabase session alone.
 */
export function IdleSessionBridge() {
  const { user, logout } = useAuth()

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    const uid = user.id

    const enforce = () => {
      if (isAppLocked(uid)) return
      const action = applyIdlePolicy(uid)
      if (action === "logout") {
        void logout()
      }
    }

    enforce()

    const id = window.setInterval(enforce, APP_IDLE_CHECK_INTERVAL_MS)

    const onAct = () => touchSessionActivity()
    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener("mousedown", onAct, opts)
    window.addEventListener("keydown", onAct, opts)
    window.addEventListener("scroll", onAct, opts)
    window.addEventListener("touchstart", onAct, opts)
    window.addEventListener("pointerdown", onAct, opts)
    window.addEventListener("focusin", onAct, opts)

    const onVisible = () => {
      if (document.visibilityState === "visible") enforce()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pageshow", enforce)

    return () => {
      window.clearInterval(id)
      window.removeEventListener("mousedown", onAct, opts)
      window.removeEventListener("keydown", onAct, opts)
      window.removeEventListener("scroll", onAct, opts)
      window.removeEventListener("touchstart", onAct, opts)
      window.removeEventListener("pointerdown", onAct, opts)
      window.removeEventListener("focusin", onAct, opts)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pageshow", enforce)
    }
  }, [user?.id, logout])

  return null
}
