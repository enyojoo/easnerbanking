"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

const OPENING_VERIFICATION_WAIT_MS = 1600

export function OpeningVerificationWait() {
  return (
    <div className="flex size-full min-h-[16rem] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="text-sm">Please wait, Opening Verification</p>
      </div>
    </div>
  )
}

/** Blank until the embed is late – avoids a spinner flash on a normal open. */
export function DelayedOpeningVerificationWait() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), OPENING_VERIFICATION_WAIT_MS)
    return () => window.clearTimeout(id)
  }, [])
  if (!visible) return null
  return <OpeningVerificationWait />
}
