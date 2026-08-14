"use client"

import { useEffect, useRef, useState } from "react"
import { setPin } from "@/lib/login-pin"
import { appPinStrings } from "@/lib/i18n/app-pin-en"
import { touchSessionActivity } from "@/lib/session-activity"
import { useSuspendIdleLock } from "@/hooks/use-suspend-idle-lock"
import { PinEntryBlock } from "./pin-entry-block"

type Step = "enter" | "confirm"

export function PinSetupScreen({
  userId,
  onComplete,
}: {
  userId: string
  onComplete: () => void
}) {
  const [step, setStep] = useState<Step>("enter")
  const [first, setFirst] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const firstRef = useRef("")

  useSuspendIdleLock(true)

  useEffect(() => {
    touchSessionActivity()
  }, [])

  const pin = step === "enter" ? first : confirm

  const setPinDigits = (next: string) => {
    setError(null)
    if (step === "enter") {
      setFirst(next)
      firstRef.current = next
    } else setConfirm(next)
  }

  useEffect(() => {
    if (step !== "enter" || first.length !== 4 || busy) return
    const t = window.setTimeout(() => {
      setStep("confirm")
      setConfirm("")
      setError(null)
    }, 280)
    return () => window.clearTimeout(t)
  }, [step, first, busy])

  useEffect(() => {
    if (step !== "confirm" || confirm.length !== 4 || busy) return
    const a = firstRef.current
    void (async () => {
      if (confirm !== a) {
        setError(appPinStrings.mismatch)
        setShake(true)
        window.setTimeout(() => setShake(false), 500)
        setStep("enter")
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
      onComplete()
    })()
  }, [step, confirm, busy, userId, onComplete])

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex min-h-screen flex-col items-center overflow-y-auto bg-background px-6 pb-10 pt-16"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-setup-title"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex w-full flex-col items-center gap-2 text-center">
          <h1 id="pin-setup-title" className="text-2xl font-semibold tracking-tight text-foreground">
            {step === "enter" ? appPinStrings.setupTitle : appPinStrings.confirmTitle}
          </h1>
          <p className="w-full text-sm leading-relaxed text-muted-foreground">
            {step === "enter" ? appPinStrings.setupSubtitle : appPinStrings.confirmSubtitle}
          </p>
        </div>
        <PinEntryBlock pin={pin} onChangePin={setPinDigits} error={error} shake={shake} disabled={busy} />
      </div>
    </div>
  )
}
