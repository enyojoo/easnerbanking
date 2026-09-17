"use client"

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import type { InfiniteData } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import type {
  OfficeTransaction,
  OfficeTransactionDetail,
} from "@/lib/types/office-transaction"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"
import type { OfficeTransactionsPage } from "./use-office-transactions"

export async function fetchOfficeTransactionDetail(transactionId: string): Promise<OfficeTransactionDetail> {
  const r = await officeFetch(`/api/admin/office/transactions/${encodeURIComponent(transactionId)}`)
  const body = (await r.json()) as OfficeTransactionDetail & { error?: string }
  if (!r.ok || body.error) {
    throw new Error(typeof body.error === "string" ? body.error : r.statusText || "Failed to load transaction")
  }
  return body
}

export function officeTransactionDetailQueryOptions(transactionId: string) {
  return {
    queryKey: officeKeys.transactionDetail(transactionId),
    queryFn: () => fetchOfficeTransactionDetail(transactionId),
    ...officeOperationalQueryDefaults,
    placeholderData: undefined,
  }
}

export function prefetchOfficeTransactionDetail(queryClient: QueryClient, transactionId: string): void {
  const id = String(transactionId || "").trim()
  if (!id) return
  void queryClient.prefetchQuery(officeTransactionDetailQueryOptions(id))
}

function idsMatch(left: string | null | undefined, right: string): boolean {
  const a = String(left || "").trim().toLowerCase()
  const b = right.trim().toLowerCase()
  return Boolean(a) && a === b
}

function transactionMatchesLookup(tx: OfficeTransaction, lookupId: string): boolean {
  return (
    idsMatch(tx.id, lookupId) ||
    idsMatch(tx.easner_transaction_id, lookupId) ||
    idsMatch(tx.provider_transaction_id, lookupId)
  )
}

export function officeDetailPlaceholderFromList(tx: OfficeTransaction): OfficeTransactionDetail {
  const userId = tx.user_id ? String(tx.user_id) : null
  const businessId = tx.business_id ? String(tx.business_id) : null
  const userName = [tx.user?.first_name, tx.user?.last_name].filter(Boolean).join(" ").trim() || null
  const userEmail = String(tx.user?.email || "").trim() || null
  const businessName = String(tx.business?.name || "").trim() || null
  return {
    transaction: tx,
    customer: {
      description: tx.label ?? null,
      displayHeroTitle: tx.label ?? null,
      chain: tx.chain ?? null,
      walletAddress: tx.wallet_address ?? null,
      counterpartyAddress: tx.counterparty_address ?? null,
    },
    ops: {
      provider: tx.provider ?? null,
      providerTransactionId: tx.provider_transaction_id ?? null,
      providerEventId: tx.provider_event_id ?? null,
      easnerTransactionId: tx.easner_transaction_id ?? null,
      ledgerId: tx.id,
      rawStatus: tx.status,
      ycMode: tx.ycMode ?? null,
      payInRail: tx.payInRail ?? null,
      chain: tx.chain ?? null,
      asset: tx.asset ?? null,
      txHash: tx.tx_hash ?? null,
      walletAddress: tx.wallet_address ?? null,
      counterpartyAddress: tx.counterparty_address ?? null,
      failureReason: null,
      createdAt: tx.created_at ?? null,
      occurredAt: tx.occurred_at ?? null,
      updatedAt: tx.updated_at ?? null,
      settledAt: tx.settled_at ?? null,
      hiddenFromFeed: tx.hidden_from_feed === true,
    },
    account: {
      userId,
      userHref: userId ? `/users/${encodeURIComponent(userId)}` : null,
      userName,
      userEmail,
      businessId,
      businessHref: businessId ? `/businesses/${encodeURIComponent(businessId)}` : null,
      businessName,
    },
    related: [],
    metadata: tx.metadata ?? null,
    payload: null,
  }
}

export function findCachedOfficeTransaction(
  queryClient: QueryClient,
  lookupId: string,
): OfficeTransaction | null {
  const needle = String(lookupId || "").trim()
  if (!needle) return null

  for (const [, data] of queryClient.getQueriesData<InfiniteData<OfficeTransactionsPage>>({
    queryKey: officeKeys.transactionsRoot(),
  })) {
    if (!data?.pages?.length) continue
    for (const page of data.pages) {
      const hit = page.transactions?.find((tx) => transactionMatchesLookup(tx, needle))
      if (hit) return hit
    }
  }

  for (const prefix of [
    [...officeKeys.root, "user-transactions"],
    [...officeKeys.root, "business-transactions"],
  ] as const) {
    for (const [, rows] of queryClient.getQueriesData<OfficeTransaction[]>({ queryKey: prefix })) {
      if (!Array.isArray(rows)) continue
      const hit = rows.find((tx) => transactionMatchesLookup(tx, needle))
      if (hit) return hit
    }
  }

  return null
}

export function useOfficeTransactionDetail(transactionId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { enabled } = useOfficeAdminEnabled()
  const id = String(transactionId || "").trim()
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")
  const placeholder = findCachedOfficeTransaction(queryClient, id)

  return useQuery({
    ...officeTransactionDetailQueryOptions(id),
    enabled: enabled && Boolean(id),
    refetchInterval,
    placeholderData: placeholder ? officeDetailPlaceholderFromList(placeholder) : undefined,
  })
}
