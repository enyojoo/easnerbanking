"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { CheckoutFeeMode } from "@/lib/stripe/checkout-fee-mode"
import type { MerchantWebhookEvent } from "@/lib/checkout/merchant-webhooks"

export type CheckoutHubSettings = {
  feeMode: CheckoutFeeMode
  businessFeeMode: CheckoutFeeMode | null
  feeModeManagedByEasner: boolean
  onlinePaymentsEnabled: boolean
  allowedOrigins: string[]
  defaultSuccessUrl: string | null
  defaultCancelUrl: string | null
  webhookUrl: string | null
  webhookSecretLast4: string | null
  liveModeEnabled: boolean
  testPaymentCompletedAt: string | null
}

export type CheckoutApiKey = {
  id: string
  mode: "test" | "live"
  publishable_key: string
  secret_key_last4: string
  created_at: string
  last_used_at: string | null
}

export type CheckoutHubPayload = {
  settings: CheckoutHubSettings
  readiness: { ready: boolean; reason: string | null }
  keys: CheckoutApiKey[]
  webhookEvents: Record<MerchantWebhookEvent, string>
}

export function useCheckoutSettings() {
  const [data, setData] = useState<CheckoutHubPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithSession("/api/checkout/settings")
      const body = (await res.json().catch(() => ({}))) as CheckoutHubPayload & { error?: string }
      if (!res.ok) throw new Error(body.error || "Could not load checkout settings")
      setData(body)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load checkout settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

export async function saveCheckoutSettings(
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; webhookSecret?: string }> {
  const res = await fetchWithSession("/api/checkout/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string; webhookSecret?: string }
  if (!res.ok) return { ok: false, error: body.error || "Could not save" }
  return { ok: true, webhookSecret: body.webhookSecret }
}
