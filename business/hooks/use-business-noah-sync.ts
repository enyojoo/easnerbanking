"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  isBusinessTier1Complete,
  needsBusinessVirtualAccountProvision,
} from "@/lib/noah/business-account-sync"
import { syncBusinessNoahStatus, syncBusinessNoahStatusUntilAccountsReady } from "@/lib/noah/sync-business-noah-status"
import { useScope } from "@/lib/query/scope"

/**
 * Business KYB: POST `/api/noah/sync-status` with `business` scope while KYB is incomplete or
 * approved but fiat virtual account ids are still missing (parity with mobile `useConsumerKycNoahSync`).
 */
export function useBusinessNoahSync(): void {
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const {
    businessId,
    tier1Complete,
    noahUsdVirtualAccountId,
    noahEurVirtualAccountId,
    canManageBusinessVerification,
    isLoading,
  } = useBusinessProfile()

  const lastAutoSyncMsRef = useRef(0)
  const [fiatProvisionResolved, setFiatProvisionResolved] = useState(false)

  useEffect(() => {
    setFiatProvisionResolved(false)
  }, [businessId])

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
      needsBusinessVirtualAccountProvision(profileSlice, { fiatProvisionResolved }))

  const runSync = useCallback(async () => {
    if (!shouldSync) return
    const now = Date.now()
    const MIN_MS = 15_000
    if (now - lastAutoSyncMsRef.current < MIN_MS) return
    lastAutoSyncMsRef.current = now

    try {
      const needsAccounts = needsBusinessVirtualAccountProvision(profileSlice, { fiatProvisionResolved })
      const result =
        isBusinessTier1Complete(profileSlice) || needsAccounts
          ? await syncBusinessNoahStatusUntilAccountsReady()
          : await syncBusinessNoahStatus()
      if (result.needsFiatAccounts === false || result.accountsReady === true) {
        setFiatProvisionResolved(true)
        if (scope) {
          void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
        }
      }
    } catch {
      /* non-blocking; hosted return + webhooks can still update */
    }
  }, [shouldSync, queryClient, scope])

  useEffect(() => {
    void runSync()
  }, [runSync])

  useEffect(() => {
    if (!shouldSync) return
    const pollMs = isBusinessTier1Complete(profileSlice) ? 10_000 : 5 * 60 * 1000
    const id = window.setInterval(() => {
      void runSync()
    }, pollMs)
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
