"use client"

import { useEffect, useState } from "react"

export function formatQuoteCountdownLabel(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000))
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm}:${String(ss).padStart(2, "0")}`
}

export function useQuoteCountdown(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const endMs = expiresAt ? new Date(expiresAt).getTime() : 0
  const remainingMs = endMs > 0 ? Math.max(0, endMs - now) : 0
  const expired = endMs > 0 && remainingMs <= 0

  return {
    expired,
    remainingMs,
    nowMs: now,
    label: formatQuoteCountdownLabel(remainingMs),
  }
}
