"use client"

import { useCallback, useEffect, useRef } from "react"
import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  isBusinessTier1Complete,
  needsBusinessVirtualAccountProvision,
} from "@/lib/noah/business-account-sync"
import { syncBusinessNoahStatus } from "@/lib/noah/sync-business-noah-status"

/**
 * Business KYB: POST `/api/noah/sync-status` with `business` scope while KYB is incomplete or
 * approved but fiat virtual account ids are still missing (parity with mobile `useConsumerKycNoahSync`).
 */
export function useBusinessNoahSync(): void {
  const {
    businessId,
    tier1Complete,
    noahUsdVirtualAccountId,
    noahEurVirtualAccountId,
    canManageBusinessVerification,
    isLoading,
  } = useBusinessProfile()

  const lastAutoSyncMsRef = useRef(0)

  const profileSlice = {
    tier1Complete,
    noahUsdVirtualAccountId,
    noahEurVirtualAccountId,
  }

  const shouldSync =
    !isLoading &&
    Boolean(businessId) &&
    canManageBusinessVerification &&
    (!isBusinessTier1Complete(profileSlice) ||
      needsBusinessVirtualAccountProvision(profileSlice))

  const runSync = useCallback(async () => {
    if (!shouldSync) return
    const now = Date.now()
    const MIN_MS = 15_000
    if (now - lastAutoSyncMsRef.current < MIN_MS) return
    lastAutoSyncMsRef.current = now

    try {
      await syncBusinessNoahStatus()
    } catch {
      /* non-blocking; hosted return + webhooks can still update */
    }
  }, [shouldSync])

  useEffect(() => {
    void runSync()
  }, [runSync])

  useEffect(() => {
    if (!shouldSync) return
    const id = window.setInterval(() => {
      void runSync()
    }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [shouldSync, runSync])

  /** Pull Noah when the user returns to the tab (approvals often complete in hosted flow). */
  useEffect(() => {
    if (!shouldSync) return
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runSync()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [shouldSync, runSync])
}
