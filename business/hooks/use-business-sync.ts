"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import {
  isBusinessTier1Complete,
  needsBusinessVirtualAccountProvision,
} from "@/lib/noah/business-account-sync"
import {
  syncBusinessGridStatus,
  syncBusinessGridStatusUntilAccountsReady,
} from "@/lib/grid/sync-business-grid-status"
import { useScope } from "@/lib/query/scope"

const DEFAULT_INCOMPLETE_POLL_MS = 60_000
const IN_REVIEW_POLL_MS = 30_000
const IN_REVIEW_ON_VERIFICATION_TAB_POLL_MS = 15_000
const APPROVED_PROVISIONING_POLL_MS = 10_000
const MIN_SYNC_MS = 15_000
const MIN_SYNC_MS_IN_REVIEW = 10_000

export function resolveBusinessSyncPollMs(input: {
  tier1Complete: boolean
  verificationStatus: string | null | undefined
}): number {
  if (isBusinessTier1Complete({ tier1Complete: input.tier1Complete })) {
    return APPROVED_PROVISIONING_POLL_MS
  }
  const status = String(input.verificationStatus ?? "").toLowerCase()
  if (status === "pending") {
    const onVerificationTab =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tab") === "verification"
    return onVerificationTab ? IN_REVIEW_ON_VERIFICATION_TAB_POLL_MS : IN_REVIEW_POLL_MS
  }
  return DEFAULT_INCOMPLETE_POLL_MS
}

export function resolveBusinessSyncMinMs(verificationStatus: string | null | undefined): number {
  return String(verificationStatus ?? "").toLowerCase() === "pending"
    ? MIN_SYNC_MS_IN_REVIEW
    : MIN_SYNC_MS
}

/**
 * Background Grid KYB sync: POST `/api/grid/sync-status` while KYB is incomplete or approved
 * but receive rails are still provisioning. Polls faster while KYB is in review (`pending`).
 */
export function useBusinessSync(): void {
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const { user } = useAuth()
  const {
    businessId,
    tier1Complete,
    tier1VerificationStatus,
    canManageBusinessVerification,
    isLoading,
  } = useBusinessProfile()

  const lastAutoSyncMsRef = useRef(0)
  const prevTier1CompleteRef = useRef(false)
  const [fiatProvisionResolved, setFiatProvisionResolved] = useState(false)

  useEffect(() => {
    if (tier1Complete && !prevTier1CompleteRef.current && user?.id) {
      dataCache.invalidate(CACHE_KEYS.PERSONAL_SETTINGS(user.id))
    }
    prevTier1CompleteRef.current = tier1Complete
  }, [tier1Complete, user?.id])

  useEffect(() => {
    setFiatProvisionResolved(false)
  }, [businessId])

  const profileSlice = { tier1Complete }

  const shouldSync =
    !isLoading &&
    Boolean(businessId) &&
    canManageBusinessVerification &&
    (!isBusinessTier1Complete(profileSlice) ||
      needsBusinessVirtualAccountProvision(profileSlice, { fiatProvisionResolved }))

  const runSync = useCallback(async () => {
    if (!shouldSync) return
    const now = Date.now()
    const minMs = resolveBusinessSyncMinMs(tier1VerificationStatus)
    if (now - lastAutoSyncMsRef.current < minMs) return
    lastAutoSyncMsRef.current = now

    try {
      const needsAccounts = needsBusinessVirtualAccountProvision(profileSlice, { fiatProvisionResolved })
      const result =
        isBusinessTier1Complete(profileSlice) || needsAccounts
          ? await syncBusinessGridStatusUntilAccountsReady()
          : await syncBusinessGridStatus()
      if (result.needsFiatAccounts === false || result.accountsReady === true) {
        setFiatProvisionResolved(true)
        if (scope) {
          void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
        }
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.PERSONAL_SETTINGS(user.id))
        }
      }
    } catch {
      /* non-blocking; hosted return + webhooks can still update */
    }
  }, [
    shouldSync,
    queryClient,
    scope,
    fiatProvisionResolved,
    profileSlice,
    tier1VerificationStatus,
    user?.id,
  ])

  useEffect(() => {
    void runSync()
  }, [runSync])

  useEffect(() => {
    if (!shouldSync) return
    const pollMs = resolveBusinessSyncPollMs({
      tier1Complete,
      verificationStatus: tier1VerificationStatus,
    })
    const id = window.setInterval(() => {
      void runSync()
    }, pollMs)
    return () => window.clearInterval(id)
  }, [shouldSync, runSync, tier1Complete, tier1VerificationStatus])

  useEffect(() => {
    if (!shouldSync) return
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runSync()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [shouldSync, runSync])
}
