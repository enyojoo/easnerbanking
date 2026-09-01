"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import {
  getVerifiedTotpFactorId,
  listFactorsForMfaStatus,
  totpFactorsFromListResponse,
  unenrollUnverifiedTotpFactors,
} from "@/lib/auth-mfa"

const MFA_STATUS_CACHE_TTL_MS = 5 * 60 * 1000
/** Keep local MFA snapshot long enough to avoid flicker after reload / new tab. */
const MFA_STATUS_LS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

type MfaStatusSnapshot = {
  statusLine: string
}

function mfaStatusCacheKey(userId: string) {
  return `mfa_security_cache_${userId}`
}

function loadMfaStatusFromLocalStorage(userId: string): MfaStatusSnapshot | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(mfaStatusCacheKey(userId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { data?: MfaStatusSnapshot; timestamp?: number }
    if (!parsed?.data || typeof parsed.timestamp !== "number") return null
    if (Date.now() - parsed.timestamp > MFA_STATUS_LS_MAX_AGE_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function saveMfaStatusToLocalStorage(userId: string, data: MfaStatusSnapshot) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(mfaStatusCacheKey(userId), JSON.stringify({ data, timestamp: Date.now() }))
  } catch {
    // ignore
  }
}

export const MFA_STATUS_ERROR_LINE = "Unable to load status"

function isSuccessfulMfaStatusLine(line: string): boolean {
  return line === "On" || line === "Off"
}

export type UseMfaStatusOptions = {
  /** When true, skip cleanup of abandoned unverified TOTP factors (e.g. MFA dialog open). */
  enrollDialogOpen?: boolean
}

export function useMfaStatus(options?: UseMfaStatusOptions) {
  const { user } = useAuth()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [statusLine, setStatusLine] = useState("")
  const [statusKnown, setStatusKnown] = useState(false)
  const enrollDialogOpen = options?.enrollDialogOpen ?? false
  const enrollDialogOpenRef = useRef(enrollDialogOpen)
  enrollDialogOpenRef.current = enrollDialogOpen

  const applyLocalStatus = useCallback(
    (line: "On" | "Off") => {
      if (!user?.id) return
      const key = CACHE_KEYS.MFA_SECURITY(user.id)
      const snapshot = { statusLine: line }
      dataCache.set(key, snapshot, MFA_STATUS_CACHE_TTL_MS)
      saveMfaStatusToLocalStorage(user.id, snapshot)
      setStatusLine(line)
      setStatusKnown(true)
    },
    [user?.id],
  )

  const refresh = useCallback(
    (refreshOptions?: { force?: boolean }) => {
      if (!user?.id) {
        setStatusLine("")
        setStatusKnown(false)
        return
      }
      const key = CACHE_KEYS.MFA_SECURITY(user.id)
      if (!refreshOptions?.force) {
        const cached = dataCache.get<{ statusLine: string }>(key)
        if (
          cached != null &&
          isSuccessfulMfaStatusLine(cached.statusLine) &&
          !dataCache.isStale(key)
        ) {
          setStatusLine(cached.statusLine)
          setStatusKnown(true)
          return
        }
      }
      void (async () => {
        const { data, error } = await listFactorsForMfaStatus(supabase)
        let nextLine: string
        if (error) {
          console.warn("MFA status:", error.message)
          const current = dataCache.get<{ statusLine: string }>(key)
          if (current != null && isSuccessfulMfaStatusLine(current.statusLine)) {
            setStatusLine(current.statusLine)
            setStatusKnown(true)
            return
          }
          nextLine = MFA_STATUS_ERROR_LINE
          dataCache.invalidate(key)
          try {
            localStorage.removeItem(mfaStatusCacheKey(user.id))
          } catch {
            // ignore
          }
        } else {
          const totp = totpFactorsFromListResponse(data)
          const id = getVerifiedTotpFactorId(totp)
          if (id) {
            nextLine = "On"
          } else {
            if (totp.some((f) => f.status === "unverified") && !enrollDialogOpenRef.current) {
              await unenrollUnverifiedTotpFactors(supabase)
            }
            nextLine = "Off"
          }
          const snapshot = { statusLine: nextLine }
          dataCache.set(key, snapshot, MFA_STATUS_CACHE_TTL_MS)
          saveMfaStatusToLocalStorage(user.id, snapshot)
        }
        setStatusLine(nextLine)
        setStatusKnown(true)
      })()
    },
    [supabase, user?.id],
  )

  useLayoutEffect(() => {
    if (!user?.id) {
      setStatusLine("")
      setStatusKnown(false)
      return
    }
    const key = CACHE_KEYS.MFA_SECURITY(user.id)
    const cached = dataCache.get<{ statusLine: string }>(key)
    if (cached != null && isSuccessfulMfaStatusLine(cached.statusLine)) {
      setStatusLine(cached.statusLine)
      setStatusKnown(true)
      return
    }
    if (cached?.statusLine === MFA_STATUS_ERROR_LINE) {
      dataCache.invalidate(key)
    }
    const local = loadMfaStatusFromLocalStorage(user.id)
    if (local && isSuccessfulMfaStatusLine(local.statusLine)) {
      dataCache.set(key, local, MFA_STATUS_CACHE_TTL_MS)
      setStatusLine(local.statusLine)
      setStatusKnown(true)
      return
    }
    if (local?.statusLine === MFA_STATUS_ERROR_LINE) {
      try {
        localStorage.removeItem(mfaStatusCacheKey(user.id))
      } catch {
        // ignore
      }
    }
    setStatusLine("")
    setStatusKnown(false)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      setStatusLine("")
      setStatusKnown(false)
      return
    }
    void refresh()
  }, [user?.id, refresh])

  return {
    statusLine,
    statusKnown,
    verified: statusLine === "On",
    loading: !statusKnown,
    refresh,
    applyLocalStatus,
  }
}
