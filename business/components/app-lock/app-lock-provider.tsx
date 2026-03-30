"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { registerAppLockListener } from "@/lib/app-lock-bus"
import {
  hasPin,
  isAppLocked,
  isLoginPinModuleAvailable,
  setAppLocked,
} from "@/lib/login-pin"
import { resetSessionActivity } from "@/lib/session-activity"
import { PinSetupScreen } from "./pin-setup-screen"
import { PinUnlockScreen } from "./pin-unlock-screen"

/**
 * Gates the authenticated shell: mandatory PIN setup (when Web Crypto available), then soft-lock UI.
 * PIN is device-local; not Supabase MFA.
 */
export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const [bump, setBump] = useState(0)

  useEffect(() => {
    return registerAppLockListener(() => setBump((n) => n + 1))
  }, [])

  const onUnlocked = useCallback(() => {
    if (!user?.id) return
    setAppLocked(user.id, false)
    resetSessionActivity()
    setBump((n) => n + 1)
  }, [user?.id])

  const onSetupComplete = useCallback(() => {
    resetSessionActivity()
    setBump((n) => n + 1)
  }, [])

  if (!user) {
    return <>{children}</>
  }

  const uid = user.id
  void bump

  if (!isLoginPinModuleAvailable()) {
    return <>{children}</>
  }

  if (!hasPin(uid)) {
    return <PinSetupScreen userId={uid} onComplete={onSetupComplete} />
  }

  if (isAppLocked(uid)) {
    return (
      <PinUnlockScreen
        user={user}
        onUnlocked={onUnlocked}
        onLogout={() => {
          void logout()
        }}
      />
    )
  }

  return <>{children}</>
}
