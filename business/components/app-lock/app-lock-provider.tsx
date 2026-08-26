"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
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
import { probeStoredSupabaseSession } from "@/lib/query/web-persist"
import { resetSessionActivity } from "@/lib/session-activity"
import { requestHostedKybPrime } from "@/lib/compliance/prime-business-verification-flow"
import { requestWorkspaceWarm } from "@/lib/query/prime-workspace-nav"
import { PinSetupScreen } from "./pin-setup-screen"
import { PinUnlockScreen } from "./pin-unlock-screen"

/**
 * Gates the authenticated shell: mandatory PIN setup (when Web Crypto available), then soft-lock UI.
 * PIN is device-local; not Supabase MFA.
 *
 * Lock decisions run in useLayoutEffect so a reload never paints the app under an active PIN gate.
 */
const POST_UNLOCK_RESUME_MS = 3_500

type PinGate = "pending" | "open" | "lock" | "setup"

function resolveBootUserId(userId: string | null | undefined, sessionUserId: string | null | undefined): string | null {
  if (userId) return userId
  if (sessionUserId) return sessionUserId
  if (typeof window === "undefined") return null
  const probe = probeStoredSupabaseSession()
  return probe.likelyAuthenticated ? probe.userId : null
}

function resolvePinGate(userId: string | null): PinGate {
  if (!userId) return "open"
  if (!isLoginPinModuleAvailable()) return "open"
  if (!hasPin(userId)) return "setup"
  if (isAppLocked(userId) || evaluateIdlePolicy(userId) === "lock") return "lock"
  return "open"
}

/** Minimal User for unlock UI before Supabase session finishes hydrating. */
function stubUser(userId: string): User {
  return {
    id: userId,
    email: undefined,
    user_metadata: {},
    app_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User
}

function PinGateHold() {
  return (
    <div
      className="fixed inset-0 z-[2147483647] bg-background"
      aria-busy="true"
      aria-label="Loading"
    />
  )
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading, sessionUserId, canBootstrapWorkspace } = useAuth()
  const [bump, setBump] = useState(0)
  const [resume, setResume] = useState({ version: 0, until: 0 })
  // Start pending so SSR + first client paint never flash the workspace under a PIN lock.
  const [gate, setGate] = useState<PinGate>("pending")
  const [gateUserId, setGateUserId] = useState<string | null>(null)

  useEffect(() => {
    return registerAppLockListener(() => setBump((n) => n + 1))
  }, [])

  useLayoutEffect(() => {
    const uid = resolveBootUserId(user?.id, sessionUserId)

    if (!uid) {
      // Still restoring a likely session — hold blank rather than painting the app.
      if (isLoading || canBootstrapWorkspace) {
        setGate("pending")
        setGateUserId(null)
        return
      }
      setGate("open")
      setGateUserId(null)
      return
    }

    const action = applyIdlePolicy(uid)
    if (action === "logout") {
      void logout()
      setGate("pending")
      setGateUserId(uid)
      return
    }

    const next = resolvePinGate(uid)
    setGateUserId(uid)
    setGate(next)
  }, [user?.id, sessionUserId, isLoading, canBootstrapWorkspace, logout, bump])

  const onUnlocked = useCallback(() => {
    const uid = user?.id ?? gateUserId
    if (!uid) return
    setAppLocked(uid, false)
    resetSessionActivity()
    setBump((n) => n + 1)
    setResume((r) => ({ version: r.version + 1, until: Date.now() + POST_UNLOCK_RESUME_MS }))
    setGate("open")
    requestHostedKybPrime()
    requestWorkspaceWarm()
  }, [user?.id, gateUserId])

  const onSetupComplete = useCallback(() => {
    resetSessionActivity()
    setBump((n) => n + 1)
    setGate("open")
    requestHostedKybPrime()
    requestWorkspaceWarm()
  }, [])

  const wrap = (node: React.ReactNode) => (
    <PostUnlockResumeProvider resumeUntil={resume.until} resumeVersion={resume.version}>
      {node}
    </PostUnlockResumeProvider>
  )

  if (gate === "pending") {
    return wrap(<PinGateHold />)
  }

  if (gate === "setup" && gateUserId) {
    return wrap(<PinSetupScreen userId={gateUserId} onComplete={onSetupComplete} />)
  }

  if (gate === "lock" && gateUserId) {
    return wrap(
      <PinUnlockScreen
        user={user?.id === gateUserId ? user : stubUser(gateUserId)}
        onUnlocked={onUnlocked}
        onLogout={() => {
          void logout()
        }}
      />,
    )
  }

  return wrap(children)
}
