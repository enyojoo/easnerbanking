"use client"

import { useBusinessProfile } from "@/lib/use-business-profile"
import {
  readHostedCredentialsCache,
  readHostedResumeAvailable,
} from "@/lib/compliance/hosted-verification-credentials"

export const HOSTED_KYB_PRIME_EVENT = "easner-prime-hosted-kyb"

/** First-party KYB no longer primes SumSub. Kept so existing callers stay safe. */
export function primeBusinessVerificationFlow(_options: {
  businessId: string | null | undefined
  canManageBusinessVerification: boolean
  tier1Complete: boolean
  tier1CanResubmit: boolean
}) {
  return
}

/** Ask the dashboard shell to refresh hosted KYB credentials (PIN unlock / setup). */
export function requestHostedKybPrime() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(HOSTED_KYB_PRIME_EVENT))
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
