"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { useScope } from "@/lib/query/scope"
import { usePaymentLinksQuery } from "@/hooks/queries/use-payment-links-query"
import type { PaymentLink } from "@/lib/payment-links/types"

export type PaymentLinkListRow = PaymentLink & { url: string }

export function usePaymentLinks(options?: { includeArchived?: boolean }) {
  const includeArchived = options?.includeArchived ?? false
  const query = usePaymentLinksQuery({ includeArchived })
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const links = query.data?.links ?? []
  const easetag = query.data?.easetag ?? null
  const loading = query.isPending && links.length === 0 && !query.data

  const refetch = useCallback(async () => {
    if (scope) {
      await queryClient.invalidateQueries({ queryKey: qk.collections.paymentLinks.root(scope) })
    }
    await query.refetch()
  }, [query, queryClient, scope])

  return {
    links,
    easetag,
    loading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch,
    isFetching: query.isFetching,
  }
}
