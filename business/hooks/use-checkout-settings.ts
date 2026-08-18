"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { getBrowserQueryClient } from "@/lib/query/query-client"
import { useScope } from "@/lib/query/scope"
import { useCheckoutSettingsQuery } from "@/hooks/queries/use-checkout-settings-query"
import type { CheckoutHubPayload } from "@/lib/checkout/hub-types"

export type {
  CheckoutApiKey,
  CheckoutHubPayload,
  CheckoutHubSettings,
} from "@/lib/checkout/hub-types"

export function useCheckoutSettings(): {
  data: CheckoutHubPayload | null
  loading: boolean
  error: string | null
  refetch: () => Promise<unknown>
  isFetching: boolean
} {
  const query = useCheckoutSettingsQuery()
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const data: CheckoutHubPayload | null = query.data ?? null
  const loading = query.isPending && !data

  const refetch = useCallback(async () => {
    if (scope) {
      await queryClient.invalidateQueries({ queryKey: qk.collections.checkoutSettings.root(scope) })
    }
    await query.refetch()
  }, [query, queryClient, scope])

  return {
    data,
    loading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch,
    isFetching: query.isFetching,
  }
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
  await getBrowserQueryClient().invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey.includes("collections") &&
      query.queryKey.includes("checkout-settings"),
  })
  return { ok: true, webhookSecret: body.webhookSecret }
}
