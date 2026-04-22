"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import { getLockoutState, hasPin, isLoginPinModuleAvailable, setPin, verifyPin } from "@/lib/login-pin"
import { appPinStrings } from "@/lib/i18n/app-pin-en"
import { PinEntryBlock } from "./pin-entry-block"
import { PinLockedHint } from "./pin-locked-hint"

/**
 * Settings: create or change app PIN (client-only; not server MFA).
 */
export function PinSettingsDialog({
  open,
  onOpenChange,
  userId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  onSaved?: () => void
}) {
  const cryptoOk = typeof window !== "undefined" && isLoginPinModuleAvailable()
  const pinExists = typeof window !== "undefined" && hasPin(userId)

  const [flow, setFlow] = useState<"create" | "change">("create")
  const [createStep, setCreateStep] = useState<"enter" | "confirm">("enter")
  const [first, setFirst] = useState("")
  const [confirm, setConfirm] = useState("")
  const [changeStep, setChangeStep] = useState<"verify" | "new" | "confirm">("verify")
  const [verifyPinState, setVerifyPinState] = useState("")
  const [newFirst, setNewFirst] = useState("")
  const [newConfirm, setNewConfirm] = useState("")
  const newFirstRef = useRef("")

  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lockTick, setLockTick] = useState(0)
  const firstRef = useRef("")

  useEffect(() => {
    if (!open) return
    setFlow(pinExists ? "change" : "create")
    setCreateStep("enter")
    setFirst("")
    setConfirm("")
    setChangeStep("verify")
    setVerifyPinState("")
    setNewFirst("")
    setNewConfirm("")
    firstRef.current = ""
    newFirstRef.current = ""
    setError(null)
  }, [open, pinExists])

  const pin =
    flow === "create"
      ? createStep === "enter"
        ? first
        : confirm
      : changeStep === "verify"
        ? verifyPinState
        : changeStep === "new"
          ? newFirst
          : newConfirm

  const changeVerifyLock = useMemo(
    () => (flow === "change" && changeStep === "verify" ? getLockoutState(userId) : null),
    [flow, changeStep, userId, lockTick],
  )

  useEffect(() => {
    if (!open || flow !== "change" || changeStep !== "verify") return
    const id = window.setInterval(() => setLockTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [open, flow, changeStep])

  const setPinDigits = (next: string) => {
    setError(null)
    if (flow === "create") {
      if (createStep === "enter") {
        setFirst(next)
        firstRef.current = next
      } else setConfirm(next)
    } else if (changeStep === "verify") setVerifyPinState(next)
    else if (changeStep === "new") {
      setNewFirst(next)
      newFirstRef.current = next
    } else setNewConfirm(next)
  }

  useEffect(() => {
    if (!open || flow !== "create" || createStep !== "enter" || first.length !== 4 || busy) return
    const t = window.setTimeout(() => {
      setCreateStep("confirm")
      setConfirm("")
    }, 280)
    return () => window.clearTimeout(t)
  }, [open, flow, createStep, first, busy])

  useEffect(() => {
    if (!open || flow !== "create" || createStep !== "confirm" || confirm.length !== 4 || busy) return
    void (async () => {
      const a = firstRef.current
      if (confirm !== a) {
        setError(appPinStrings.mismatch)
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        setCreateStep("enter")
        setFirst("")
        setConfirm("")
        firstRef.current = ""
        return
      }
      setBusy(true)
      const res = await setPin(userId, confirm)
      setBusy(false)
      if (!res.ok) {
        setError(res.error)
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        return
      }
      onSaved?.()
      onOpenChange(false)
    })()
  }, [open, flow, createStep, confirm, busy, userId, onOpenChange, onSaved])

  useEffect(() => {
    if (!open || flow !== "change" || changeStep !== "verify" || verifyPinState.length !== 4 || busy) return
    void (async () => {
      setBusy(true)
      const res = await verifyPin(userId, verifyPinState)
      setBusy(false)
      if (!res.ok) {
        if (res.lockedOut) {
          setError(null)
        } else {
          setError(res.error)
        }
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        setVerifyPinState("")
        return
      }
      setChangeStep("new")
      setNewFirst("")
      setNewConfirm("")
    })()
  }, [open, flow, changeStep, verifyPinState, busy, userId])

  useEffect(() => {
    if (!open || flow !== "change" || changeStep !== "new" || newFirst.length !== 4 || busy) return
    const t = window.setTimeout(() => {
      setChangeStep("confirm")
      setNewConfirm("")
    }, 280)
    return () => window.clearTimeout(t)
  }, [open, flow, changeStep, newFirst, busy])

  useEffect(() => {
    if (!open || flow !== "change" || changeStep !== "confirm" || newConfirm.length !== 4 || busy) return
    void (async () => {
      if (newConfirm !== newFirstRef.current) {
        setError(appPinStrings.mismatch)
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        setChangeStep("new")
        setNewFirst("")
        setNewConfirm("")
        newFirstRef.current = ""
        return
      }
      setBusy(true)
      const res = await setPin(userId, newConfirm)
      setBusy(false)
      if (!res.ok) {
        setError(res.error)
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        return
      }
      onSaved?.()
      onOpenChange(false)
    })()
  }, [open, flow, changeStep, newConfirm, busy, userId, onOpenChange, onSaved])

  if (!cryptoOk) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{appPinStrings.settingsAppPin}</DialogTitle>
            <DialogDescription>{appPinStrings.errorWebCrypto}</DialogDescription>
          </DialogHeader>
          <Button onClick={() => onOpenChange(false)}>{appPinStrings.dialogCancel}</Button>
        </DialogContent>
      </Dialog>
    )
  }

  const title =
    flow === "create"
      ? createStep === "enter"
        ? appPinStrings.setupTitle
        : appPinStrings.confirmTitle
      : changeStep === "verify"
        ? appPinStrings.settingsCurrentPin
        : changeStep === "new"
          ? appPinStrings.settingsNewPin
          : appPinStrings.settingsConfirmNew

  const description =
    flow === "create"
      ? createStep === "enter"
        ? appPinStrings.setupSubtitle
        : appPinStrings.confirmSubtitle
      : changeStep === "verify"
        ? appPinStrings.dialogAuthorizeDesc
        : changeStep === "new"
          ? appPinStrings.setupSubtitle
          : appPinStrings.confirmSubtitle

  const verifyLocked =
    flow === "change" &&
    changeStep === "verify" &&
    changeVerifyLock?.lockedOut &&
    changeVerifyLock.lockedUntil != null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {title}
          </DialogTitle>
          {verifyLocked ? null : <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <PinEntryBlock
          pin={pin}
          onChangePin={setPinDigits}
          error={
            flow === "change" && changeStep === "verify" && changeVerifyLock?.lockedOut ? null : error
          }
          message={
            verifyLocked && changeVerifyLock ? (
              <PinLockedHint msRemaining={changeVerifyLock.msRemaining} variant="destructive" />
            ) : null
          }
          shake={shake}
          disabled={busy || !!(flow === "change" && changeStep === "verify" && changeVerifyLock?.lockedOut)}
        />
      </DialogContent>
    </Dialog>
  )
}
