"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { useAuth } from "@/lib/auth-context"
import { personalSettingsStore } from "@/lib/personal-settings-store"
import {
  isBusinessTier1Complete,
  needsBusinessVirtualAccountProvision,
} from "@/lib/noah/business-account-sync"
import { fetchWithSession } from "@/lib/fetch-with-session"
import {
  syncBusinessGridStatus,
  syncBusinessGridStatusUntilAccountsReady,
} from "@/lib/grid/sync-business-grid-status"
import { useScope } from "@/lib/query/scope"
import { analytics } from "@/lib/analytics"

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
    bridgeKycStatus,
    bridgeCustomerId,
    bridgeKycComplete,
    canManageBusinessVerification,
    isLoading,
  } = useBusinessProfile()

  const lastAutoSyncMsRef = useRef(0)
  const prevTier1CompleteRef = useRef(false)
  const prevVerificationStatusRef = useRef<string | null>(null)
  const [fiatProvisionResolved, setFiatProvisionResolved] = useState(false)

  useEffect(() => {
    if (tier1Complete && !prevTier1CompleteRef.current && user?.id) {
      personalSettingsStore.invalidate(user.id)
      analytics.trackKybApproved({ businessId: businessId ?? undefined })
    }
    prevTier1CompleteRef.current = tier1Complete
  }, [tier1Complete, user?.id, businessId])

  useEffect(() => {
    const status = String(tier1VerificationStatus ?? "").toLowerCase()
    const prev = prevVerificationStatusRef.current
    if (prev && prev !== status && (status === "rejected" || status === "declined")) {
      analytics.trackKybRejected({ businessId: businessId ?? undefined, status })
    }
    prevVerificationStatusRef.current = status || null
  }, [tier1VerificationStatus, businessId])

  useEffect(() => {
    setFiatProvisionResolved(false)
  }, [businessId])

  // Memoized on the primitive: an inline object literal here changed identity
  // every render, which recreated `runSync` and tore down / rebuilt its
  // effect, interval, and visibility listener on every workspace render.
  const profileSlice = useMemo(() => ({ tier1Complete }), [tier1Complete])

  const bridgeKycStarted =
    !bridgeKycComplete &&
    (Boolean(bridgeCustomerId?.trim()) ||
      (Boolean(bridgeKycStatus) && String(bridgeKycStatus).toLowerCase() !== "not_started"))

  const gridApproved = String(tier1VerificationStatus ?? "").toLowerCase() === "approved"
  const gridInFlight =
    !gridApproved &&
    Boolean(tier1VerificationStatus) &&
    String(tier1VerificationStatus).toLowerCase() !== "not_started"
  const shouldSyncBridge = bridgeKycStarted || bridgeKycComplete

  const shouldSync =
    !isLoading &&
    Boolean(businessId) &&
    canManageBusinessVerification &&
    (!isBusinessTier1Complete(profileSlice) ||
      needsBusinessVirtualAccountProvision(profileSlice, { fiatProvisionResolved }) ||
      bridgeKycStarted ||
      gridInFlight)

  const runSync = useCallback(async () => {
    if (!shouldSync) return
    const now = Date.now()
    const minMs = resolveBusinessSyncMinMs(tier1VerificationStatus)
    if (now - lastAutoSyncMsRef.current < minMs) return
    lastAutoSyncMsRef.current = now

    try {
      const needsAccounts = needsBusinessVirtualAccountProvision(profileSlice, { fiatProvisionResolved })
      let result: Awaited<ReturnType<typeof syncBusinessGridStatus>> = { ok: true }

      if (gridApproved) {
        result = await syncBusinessGridStatusUntilAccountsReady()
      } else if (gridInFlight || (!bridgeKycComplete && (!tier1Complete || needsAccounts))) {
        result = await syncBusinessGridStatus()
      }

      let bridgeProvisioned = false
      if (shouldSyncBridge) {
        const bridgeRes = await fetchWithSession("/api/bridge/sync-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Easner-Account-Scope": "business",
          },
          body: JSON.stringify({}),
        }).catch(() => undefined)
        if (bridgeRes?.ok) {
          const json = (await bridgeRes.json().catch(() => null)) as { provisioned?: boolean } | null
          bridgeProvisioned = json?.provisioned === true
        }
      }

      const gridAccountsReady = result.needsFiatAccounts === false || result.accountsReady === true
      const bridgeOnlyReady = Boolean(bridgeKycComplete && !gridApproved && bridgeProvisioned)
      if (gridAccountsReady || bridgeOnlyReady) {
        setFiatProvisionResolved(true)
        if (scope) {
          void queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
        }
        if (user?.id) {
          personalSettingsStore.invalidate(user.id)
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
    tier1Complete,
    bridgeKycStarted,
    bridgeKycComplete,
    gridApproved,
    gridInFlight,
    shouldSyncBridge,
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
