"use client"

import { useCallback, useRef, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"

type Args = {
  /** Server-side “unchanged” Easetag (no availability check when equal). */
  profileEasetag: string | null | undefined
}

/**
 * Debounced `/api/business/easetag/check` + status flags for settings and onboarding.
 * Caller owns string state; call `processInput` on each keystroke with the raw field value.
 */
export function useBusinessEasetagAvailability({ profileEasetag }: Args) {
  const [easetagAvailable, setEasetagAvailable] = useState<boolean | null>(null)
  const [easetagValidationError, setEasetagValidationError] = useState<string | null>(null)
  const [checkingEasetag, setCheckingEasetag] = useState(false)
  const easetagCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const easetagInputGenRef = useRef(0)
  const easetagPendingChecksRef = useRef(0)

  const profileTagNorm = (profileEasetag || "").replace(/^@/, "").trim().toLowerCase()

  const checkEasetagAvailability = useCallback(
    async (raw: string, scheduledGen: number) => {
      const trimmed = raw.replace(/^@/, "").trim().toLowerCase()
      if (!trimmed || trimmed === profileTagNorm) {
        if (scheduledGen === easetagInputGenRef.current) {
          setEasetagAvailable(null)
          setEasetagValidationError(null)
        }
        return
      }
      if (trimmed.length < 4) {
        if (scheduledGen === easetagInputGenRef.current) {
          setEasetagAvailable(null)
          setEasetagValidationError(null)
        }
        return
      }
      setEasetagValidationError(null)
      easetagPendingChecksRef.current += 1
      setCheckingEasetag(true)
      try {
        const res = await fetchWithSession(
          `/api/business/easetag/check?easetag=${encodeURIComponent(trimmed)}`,
        )
        let data: Record<string, unknown> = {}
        try {
          data = (await res.json()) as Record<string, unknown>
        } catch {
          if (scheduledGen !== easetagInputGenRef.current) return
          setEasetagAvailable(null)
          setEasetagValidationError(null)
          return
        }
        if (scheduledGen !== easetagInputGenRef.current) return
        if (!res.ok) {
          setEasetagAvailable(null)
          setEasetagValidationError(null)
          return
        }
        const validRaw = data.valid
        const isInvalid =
          validRaw === false || String(validRaw).toLowerCase() === "false" || validRaw === 0
        if (isInvalid) {
          setEasetagAvailable(null)
          const err = typeof data.error === "string" ? data.error.trim() : ""
          setEasetagValidationError(err || "This Easetag is not valid.")
          return
        }
        const availRaw = data.available
        const isAvail =
          availRaw === true ||
          availRaw === 1 ||
          (typeof availRaw === "string" && ["true", "1"].includes(availRaw.toLowerCase()))
        if (scheduledGen !== easetagInputGenRef.current) return
        setEasetagAvailable(isAvail)
      } catch {
        if (scheduledGen !== easetagInputGenRef.current) return
        setEasetagAvailable(null)
        setEasetagValidationError(null)
      } finally {
        easetagPendingChecksRef.current = Math.max(0, easetagPendingChecksRef.current - 1)
        if (easetagPendingChecksRef.current === 0) {
          setCheckingEasetag(false)
        }
      }
    },
    [profileTagNorm],
  )

  const resetCheckState = useCallback(() => {
    easetagInputGenRef.current += 1
    setCheckingEasetag(false)
    setEasetagAvailable(null)
    setEasetagValidationError(null)
    if (easetagCheckTimeout.current) clearTimeout(easetagCheckTimeout.current)
  }, [])

  /** Raw `Input` value → normalized storage (no @ / spaces). Schedules availability check. */
  const processInput = useCallback(
    (value: string): string => {
      const clean = value.replace(/^@/g, "").replace(/\s/g, "")
      easetagInputGenRef.current += 1
      const scheduledGen = easetagInputGenRef.current
      setEasetagAvailable(null)
      setEasetagValidationError(null)
      if (easetagCheckTimeout.current) clearTimeout(easetagCheckTimeout.current)
      if (!clean || clean.toLowerCase() === profileTagNorm) {
        return clean
      }
      if (clean.length < 4) {
        return clean
      }
      easetagCheckTimeout.current = setTimeout(
        () => void checkEasetagAvailability(clean, scheduledGen),
        400,
      )
      return clean
    },
    [checkEasetagAvailability, profileTagNorm],
  )

  return {
    easetagAvailable,
    easetagValidationError,
    checkingEasetag,
    processInput,
    resetCheckState,
  }
}
