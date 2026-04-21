"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Lock } from "lucide-react"
import { getLockoutState, verifyPin, type VerifyPinResult } from "@/lib/login-pin"
import { appPinStrings } from "@/lib/i18n/app-pin-en"
import { PinEntryBlock } from "./pin-entry-block"

function formatLockCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

/**
 * Modal PIN challenge for sensitive actions (e.g. confirm send). Same keypad as full-screen lock.
 * PIN is client-only UX; not server MFA.
 */
export function PinChallengeDialog({
  open,
  onOpenChange,
  userId,
  onVerified,
  title = appPinStrings.dialogAuthorizeTitle,
  description = appPinStrings.dialogAuthorizeDesc,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  onVerified: () => void
  title?: string
  description?: string
}) {
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  /** Re-read lockout from storage while dialog is open (countdown). */
  const [lockTick, setLockTick] = useState(0)
  const lock = useMemo(() => getLockoutState(userId), [userId, lockTick])
  const lastTryRef = useRef<string>("")

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setLockTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [open])

  useEffect(() => {
    if (!open) {
      setPin("")
      setError(null)
      setBusy(false)
      lastTryRef.current = ""
    }
  }, [open])

  useEffect(() => {
    if (pin.length === 0) lastTryRef.current = ""
  }, [pin])

  useEffect(() => {
    if (!open || pin.length !== 4 || busy || lock.lockedOut) return
    if (lastTryRef.current === pin) return
    lastTryRef.current = pin
    void (async () => {
      setBusy(true)
      setError(null)
      const res: VerifyPinResult = await verifyPin(userId, pin)
      setBusy(false)
      if (res.ok) {
        setPin("")
        onVerified()
        onOpenChange(false)
        return
      }
      setError(res.error)
      setShake(true)
      window.setTimeout(() => setShake(false), 500)
      setPin("")
    })()
  }, [pin, open, busy, lock.lockedOut, userId, onVerified, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {lock.lockedOut && lock.lockedUntil != null ? (
          <p className="text-center text-sm text-destructive">
            {`PIN locked. Try again in ${formatLockCountdown(lock.msRemaining)}`}
          </p>
        ) : null}
        <div className="py-2">
          <PinEntryBlock
            pin={pin}
            onChangePin={setPin}
            error={error}
            shake={shake}
            disabled={busy || lock.lockedOut}
          />
        </div>
        {busy ? <p className="text-center text-sm text-muted-foreground">{appPinStrings.lockVerifying}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
