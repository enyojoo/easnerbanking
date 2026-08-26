"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { getLockoutState, verifyPin, type VerifyPinResult } from "@/lib/login-pin"
import { appPinStrings } from "@/lib/i18n/app-pin-en"
import { usePersonalProfileAvatar } from "@/lib/use-personal-profile-avatar"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"
import { PinEntryBlock } from "./pin-entry-block"
import { PinLockedHint } from "./pin-locked-hint"
import { PinUserAvatar } from "./pin-user-avatar"

function firstName(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const name = typeof meta?.name === "string" ? meta.name.trim() : ""
  if (name) {
    const part = name.split(/\s+/)[0]
    return part ?? ""
  }
  return user.email?.split("@")[0] ?? ""
}

function initials(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const name = typeof meta?.name === "string" ? meta.name.trim() : ""
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const e = user.email ?? "?"
  return e.slice(0, 2).toUpperCase()
}

export function PinUnlockScreen({
  user,
  onUnlocked,
  onLogout,
}: {
  user: User
  onUnlocked: () => void
  onLogout: () => void
}) {
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [lockTick, setLockTick] = useState(0)
  const lock = useMemo(() => getLockoutState(user.id), [user.id, lockTick])
  const lastAttemptRef = useRef<string>("")
  const { avatarUrl } = usePersonalProfileAvatar(user.id)

  useSuspendIdleLock(true)

  useEffect(() => {
    const id = window.setInterval(() => setLockTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const runVerify = useCallback(
    async (code: string) => {
      setBusy(true)
      setError(null)
      const res: VerifyPinResult = await verifyPin(user.id, code)
      setBusy(false)
      if (res.ok) {
        setPin("")
        onUnlocked()
        return
      }
      if (res.lockedOut) {
        setError(null)
      } else {
        setError(res.error)
      }
      setShake(true)
      window.setTimeout(() => setShake(false), 500)
      setPin("")
    },
    [user.id, onUnlocked],
  )

  useEffect(() => {
    if (pin.length === 0) lastAttemptRef.current = ""
  }, [pin])

  useEffect(() => {
    if (pin.length !== 4 || busy || lock.lockedOut) return
    if (lastAttemptRef.current === pin) return
    lastAttemptRef.current = pin
    void runVerify(pin)
  }, [pin, busy, lock.lockedOut, runVerify])

  const name = firstName(user)

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex min-h-screen flex-col items-center overflow-y-auto bg-background px-6 pb-10 pt-16"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-unlock-title"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <PinUserAvatar initials={initials(user)} avatarUrl={avatarUrl} />
        <div className="space-y-1 text-center">
          <h1 id="pin-unlock-title" className="text-2xl font-semibold tracking-tight text-foreground">
            {appPinStrings.lockWelcome(name)}
          </h1>
        </div>
        <PinEntryBlock
          pin={pin}
          onChangePin={setPin}
          error={lock.lockedOut ? null : error}
          message={
            lock.lockedOut && lock.lockedUntil != null ? (
              <PinLockedHint msRemaining={lock.msRemaining} variant="destructive" />
            ) : (
              <p className="text-center text-sm text-muted-foreground">{appPinStrings.lockEnterPin}</p>
            )
          }
          shake={shake}
          disabled={busy || lock.lockedOut}
        />
        <p className="pt-6 text-center text-sm text-muted-foreground">
          {appPinStrings.lockNotYourAccount}{" "}
          <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => void onLogout()}>
            {appPinStrings.lockLogOut}
          </button>
        </p>
      </div>
    </div>
  )
}
