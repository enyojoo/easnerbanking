"use client"

import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  preloadSumsubWebSdk,
  primeHostedVerificationCredentials,
  readHostedCredentialsCache,
  readHostedResumeAvailable,
} from "@/lib/compliance/hosted-verification-credentials"

/** Prime KYB credentials + SumSub bundle when Settings opens or the Verification tab is hinted. */
export function primeBusinessVerificationFlow(options: {
  businessId: string | null | undefined
  canManageBusinessVerification: boolean
  tier1Complete: boolean
  tier1CanResubmit: boolean
}) {
  const { businessId, canManageBusinessVerification, tier1Complete, tier1CanResubmit } = options
  if (!businessId || !canManageBusinessVerification || tier1Complete || !tier1CanResubmit) {
    return
  }
  preloadSumsubWebSdk()
  void primeHostedVerificationCredentials({ businessId })
}

export function useVerificationFlowPrime() {
  const {
    businessId,
    canManageBusinessVerification,
    tier1Complete,
    tier1CanResubmit,
  } = useBusinessProfile()

  return () =>
    primeBusinessVerificationFlow({
      businessId,
      canManageBusinessVerification,
      tier1Complete,
      tier1CanResubmit,
    })
}

export function readVerificationCredentialsReady(businessId: string | null | undefined): boolean {
  if (!businessId) return false
  const cached = readHostedCredentialsCache(businessId)
  return Boolean(cached.link?.trim() || cached.token?.trim())
}

export { readHostedResumeAvailable }
