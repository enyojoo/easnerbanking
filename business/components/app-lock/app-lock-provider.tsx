"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { applyIdlePolicy, evaluateIdlePolicy } from "@/lib/app-idle-policy"
import { PostUnlockResumeProvider } from "@/lib/post-unlock-resume-context"
import { registerAppLockListener } from "@/lib/app-lock-bus"
import {
  hasPin,
  isAppLocked,
  isLoginPinModuleAvailable,
  setAppLocked,
} from "@/lib/login-pin"
import { isIdleLockSuspended, resetSessionActivity } from "@/lib/session-activity"
import { PinSetupScreen } from "./pin-setup-screen"
import { PinUnlockScreen } from "./pin-unlock-screen"

/**
 * Gates the authenticated shell: mandatory PIN setup (when Web Crypto available), then soft-lock UI.
 * PIN is device-local; not Supabase MFA.
 */
const POST_UNLOCK_RESUME_MS = 3_500

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const [bump, setBump] = useState(0)
  const [resume, setResume] = useState({ version: 0, until: 0 })

  useEffect(() => {
    return registerAppLockListener(() => setBump((n) => n + 1))
  }, [])

  useLayoutEffect(() => {
    if (!user?.id) return
    if (isIdleLockSuspended()) return
    const action = applyIdlePolicy(user.id)
    if (action === "logout") {
      void logout()
    }
  }, [user?.id, logout])

  const onUnlocked = useCallback(() => {
    if (!user?.id) return
    setAppLocked(user.id, false)
    resetSessionActivity()
    setBump((n) => n + 1)
    setResume((r) => ({ version: r.version + 1, until: Date.now() + POST_UNLOCK_RESUME_MS }))
  }, [user])

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
    return (
      <PostUnlockResumeProvider resumeUntil={resume.until} resumeVersion={resume.version}>
        {children}
      </PostUnlockResumeProvider>
    )
  }

  if (!hasPin(uid)) {
    return (
      <PostUnlockResumeProvider resumeUntil={resume.until} resumeVersion={resume.version}>
        <PinSetupScreen userId={uid} onComplete={onSetupComplete} />
      </PostUnlockResumeProvider>
    )
  }

  const idleRequiresLock = evaluateIdlePolicy(uid) === "lock"
  if (!isIdleLockSuspended() && (isAppLocked(uid) || idleRequiresLock)) {
    return (
      <PostUnlockResumeProvider resumeUntil={resume.until} resumeVersion={resume.version}>
        <PinUnlockScreen
          user={user}
          onUnlocked={onUnlocked}
          onLogout={() => {
            void logout()
          }}
        />
      </PostUnlockResumeProvider>
    )
  }

  return (
    <PostUnlockResumeProvider resumeUntil={resume.until} resumeVersion={resume.version}>
      {children}
    </PostUnlockResumeProvider>
  )
}
