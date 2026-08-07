"use client"

import { useCallback, useEffect } from "react"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { useAuth } from "@/lib/auth-context"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useCachedData } from "@/lib/use-cached-data"
import type { Account, StablecoinAccount } from "@/lib/finance-types"
import {
  canProvisionInvoiceDepositInstructions,
  TIER2_COMPLETE_PLACEHOLDER,
} from "@/lib/compliance-placeholders"

const PAY_IN_TTL_MS = 60 * 60 * 1000

const FIAT_STABLE_FOR_CACHE = ["USD", "EUR", "GBP", "NGN"] as const

export function invalidateInvoicePayInCacheForUser(userId: string) {
  for (const c of FIAT_STABLE_FOR_CACHE) {
    dataCache.invalidate(CACHE_KEYS.INVOICE_PAY_IN(userId, c))
  }
}

type PayInResponse = {
  bankAccount?: Account
  stablecoinAccount?: StablecoinAccount
}

type Options = {
  /** Invoice fiat currency (e.g. invoice.currency). */
  currency: string
  /** Typically `tier1Complete` from business profile. */
  tier1Complete: boolean
  /** When false, skip fetch and cache (e.g. invoice not payable). */
  enabled?: boolean
}

export function useInvoicePayIn({ currency, tier1Complete, enabled = true }: Options) {
  const { user, isLoading: authLoading } = useAuth()
  const code = currency.trim().toUpperCase()
  const canProvision = canProvisionInvoiceDepositInstructions(
    code,
    tier1Complete,
    TIER2_COMPLETE_PLACEHOLDER,
  )

  const fetchPayIn = useCallback(async () => {
    const res = await fetchWithSession(
      `/api/business/b2b/invoice-pay-in?currency=${encodeURIComponent(code)}`,
      { headers: { "X-Easner-Account-Scope": "business" } },
    )
    const data = (await res.json().catch(() => ({}))) as PayInResponse & { error?: string }
    if (!res.ok) {
      throw new Error(data.error || "Failed to load payment instructions")
    }
    return data
  }, [code])

  const onError = useCallback(() => {
    /* Errors surfaced via consumers if needed */
  }, [])

  const shouldFetch = Boolean(
    enabled && canProvision && code && user?.id && !authLoading,
  )

  const { data, loading, refetch } = useCachedData<PayInResponse>({
    enabled: shouldFetch,
    cacheKey: user?.id && shouldFetch ? CACHE_KEYS.INVOICE_PAY_IN(user.id, code) : null,
    persistKey: user?.id && shouldFetch ? `easner_invoice_pay_in_${user.id}_${code}` : undefined,
    initialData: {},
    ttlMs: PAY_IN_TTL_MS,
    fetcher: fetchPayIn,
    onError,
  })

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    const onProfileUpdate = () => invalidateInvoicePayInCacheForUser(user.id)
    window.addEventListener("business-profile-updated", onProfileUpdate)
    return () => window.removeEventListener("business-profile-updated", onProfileUpdate)
  }, [user?.id])

  if (!shouldFetch) {
    return {
      bankAccount: undefined as Account | undefined,
      stablecoinAccount: undefined as StablecoinAccount | undefined,
      loading: false,
      refetch,
    }
  }

  return {
    bankAccount: data.bankAccount,
    stablecoinAccount: data.stablecoinAccount,
    loading,
    refetch,
  }
}
