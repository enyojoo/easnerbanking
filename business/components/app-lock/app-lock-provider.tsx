"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"
import { evaluateIdlePolicy } from "@/lib/app-idle-policy"
import { emitAppUnlocked, registerAppLockListener } from "@/lib/app-lock-bus"
import { PostUnlockResumeProvider } from "@/lib/post-unlock-resume-context"
import { setAppLocked } from "@/lib/login-pin"
import { resolveBootUserId, resolvePinGate, type PinGate } from "@/lib/pin-gate"
import { resetSessionActivity } from "@/lib/session-activity"
import { requestHostedKybPrime } from "@/lib/compliance/prime-business-verification-flow"
import { requestWorkspaceWarm } from "@/lib/query/prime-workspace-nav"
import { PinSetupScreen } from "./pin-setup-screen"
import { PinUnlockScreen } from "./pin-unlock-screen"
import { PinLayer } from "./pin-layer"

/**
 * Gates the authenticated shell: mandatory PIN setup (when Web Crypto available), then soft-lock UI.
 * PIN is device-local; not Supabase MFA.
 *
 * Lock decisions run in useLayoutEffect so a reload never paints the app under an active PIN gate.
 * Gate always starts pending (SSR-safe). The layout effect resolves lock/setup/open before paint.
 */
const POST_UNLOCK_RESUME_MS = 3_500

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
  const [gate, setGate] = useState<PinGate>("pending")
  const [gateUserId, setGateUserId] = useState<string | null>(null)

  useEffect(() => {
    return registerAppLockListener(() => setBump((n) => n + 1))
  }, [])

  useLayoutEffect(() => {
    const uid = resolveBootUserId(user?.id, sessionUserId)

    if (!uid) {
      // Still restoring a likely session — hold rather than painting the app.
      if (isLoading || canBootstrapWorkspace) {
        setGate("pending")
        setGateUserId(null)
        return
      }
      setGate("open")
      setGateUserId(null)
      return
    }

    const action = evaluateIdlePolicy(uid)
    if (action === "logout") {
      void logout()
      setGate("pending")
      setGateUserId(uid)
      return
    }

    // Persist lock without emitAppLocked — that listener bumps this effect.
    if (action === "lock") {
      setAppLocked(uid, true)
    }

    const next = resolvePinGate(uid)
    if (next === "lock" || next === "setup") {
      toast.dismiss()
    }
    setGateUserId(uid)
    setGate(next)
  }, [user?.id, sessionUserId, isLoading, canBootstrapWorkspace, logout, bump])

  const onUnlocked = useCallback(() => {
    const uid = user?.id ?? gateUserId
    if (!uid) return
    setAppLocked(uid, false)
    resetSessionActivity()
    emitAppUnlocked()
    setBump((n) => n + 1)
    setResume((r) => ({ version: r.version + 1, until: Date.now() + POST_UNLOCK_RESUME_MS }))
    setGate("open")
    requestHostedKybPrime()
    requestWorkspaceWarm()
  }, [user?.id, gateUserId])

  const onSetupComplete = useCallback(() => {
    resetSessionActivity()
    emitAppUnlocked()
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

  const gatedWithoutUser = (gate === "lock" || gate === "setup") && !gateUserId
  if (gate === "pending" || gatedWithoutUser) {
    return wrap(
      <PinLayer>
        <PinGateHold />
      </PinLayer>,
    )
  }

  if (gate === "setup" && gateUserId) {
    return wrap(
      <PinLayer>
        <PinSetupScreen userId={gateUserId} onComplete={onSetupComplete} />
      </PinLayer>,
    )
  }

  if (gate === "lock" && gateUserId) {
    return wrap(
      <PinLayer>
        <PinUnlockScreen
          user={user?.id === gateUserId ? user : stubUser(gateUserId)}
          onUnlocked={onUnlocked}
          onLogout={() => {
            void logout()
          }}
        />
      </PinLayer>,
    )
  }

  return wrap(children)
}
