/**
 * Platform-wide Supabase Realtime → TanStack Query bridge for Easner Office.
 */

import type { QueryClient } from "@tanstack/react-query"
import {
  createBatcher,
  patchRowInPages,
  type RealtimeHealth,
  type SupabaseLikeClient,
} from "@easner/shared"
import { officeKeys } from "./keys"

const OVERVIEW_PRESETS = ["7d", "30d", "90d", "1y", "all"] as const

const TRANSACTIONS_QUERY_PREFIX = officeKeys.transactionsRoot()

type OfficeTransactionsPage = {
  transactions: Array<{
    id: string
    status: string
    updated_at?: string
    occurred_at?: string | null
  }>
}

function shouldInvalidateTransactionUpdate(row: Record<string, unknown>): boolean {
  if (row.metadata !== undefined) return true
  if (row.amount !== undefined) return true
  if (row.currency !== undefined) return true
  const status = String(row.status ?? "").toLowerCase()
  return ["completed", "settled", "deposited", "failed", "cancelled", "canceled"].includes(status)
}

function patchOfficeTransactionInCache(
  qc: QueryClient,
  row: Record<string, unknown>,
): boolean {
  const id = row.id != null ? String(row.id) : ""
  if (!id) return false

  const patchFn = (tx: OfficeTransactionsPage["transactions"][number]) => ({
    ...tx,
    status: String(row.status ?? tx.status),
    updated_at: row.updated_at != null ? String(row.updated_at) : tx.updated_at,
    occurred_at: row.occurred_at != null ? String(row.occurred_at) : tx.occurred_at,
  })

  const infinitePatched = patchRowInPages<OfficeTransactionsPage>(qc, TRANSACTIONS_QUERY_PREFIX, id, patchFn)

  let flatPatched = false
  const userQueries = qc.getQueriesData<OfficeTransactionsPage["transactions"]>({
    queryKey: [...officeKeys.root, "user-transactions"],
  })
  for (const [queryKey, prev] of userQueries) {
    if (!Array.isArray(prev) || prev.length === 0) continue
    let changed = false
    const transactions = prev.map((tx) => {
      if (tx.id !== id) return tx
      changed = true
      return patchFn(tx)
    })
    if (!changed) continue
    flatPatched = true
    qc.setQueryData(queryKey, transactions)
  }

  return infinitePatched || flatPatched
}

function invalidateOverview(qc: QueryClient, refetchType: "active" | "inactive" = "inactive"): void {
  for (const preset of OVERVIEW_PRESETS) {
    qc.invalidateQueries({ queryKey: officeKeys.overview(preset), refetchType })
  }
}

function invalidateAllTransactionQueries(qc: QueryClient, refetchType: "active" | "inactive" = "active"): void {
  qc.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_PREFIX, refetchType })
  qc.invalidateQueries({ queryKey: [...officeKeys.root, "user-transactions"], refetchType })
}

function invalidateMerchantQueries(qc: QueryClient, refetchType: "active" | "inactive" = "inactive"): void {
  qc.invalidateQueries({ queryKey: officeKeys.businesses(), refetchType })
  qc.invalidateQueries({ queryKey: officeKeys.businessCustomers(), refetchType })
  qc.invalidateQueries({ queryKey: officeKeys.businessInvoices(), refetchType })
  qc.invalidateQueries({ queryKey: officeKeys.terminalSessions(), refetchType })
}

function invalidateEventInboxQueries(qc: QueryClient, refetchType: "active" | "inactive" = "inactive"): void {
  qc.invalidateQueries({ queryKey: [...officeKeys.root, "event-inbox"], refetchType })
}

export interface AttachOfficeRealtimeOptions {
  qc: QueryClient
  supabase: SupabaseLikeClient
  batchMs?: number
  onHealth?: (h: RealtimeHealth) => void
}

export function attachOfficeRealtime({
  qc,
  supabase,
  batchMs = 50,
  onHealth,
}: AttachOfficeRealtimeOptions): () => void {
  const batcher = createBatcher(batchMs)
  const health: RealtimeHealth = { subscribed: false, lastEventAt: null, lastError: null }
  const emit = () => onHealth?.({ ...health })

  const invalidateOverviewLazy = () => invalidateOverview(qc, "inactive")

  const channel = supabase.channel("office:admin", { config: { broadcast: { self: false } } })

  const scheduleTransactions = (row?: Record<string, unknown>) => {
    batcher.schedule(TRANSACTIONS_QUERY_PREFIX, () => {
      if (row && shouldInvalidateTransactionUpdate(row)) {
        invalidateAllTransactionQueries(qc, "active")
        invalidateOverviewLazy()
        return
      }
      if (row && patchOfficeTransactionInCache(qc, row)) {
        invalidateOverviewLazy()
        return
      }
      invalidateAllTransactionQueries(qc, "active")
      invalidateOverviewLazy()
    })
  }

  const scheduleUsers = () => {
    batcher.schedule(officeKeys.users(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.users(), refetchType: "active" })
      invalidateOverviewLazy()
    })
  }

  const scheduleMerchant = () => {
    batcher.schedule(officeKeys.businesses(), () => {
      invalidateMerchantQueries(qc, "active")
      invalidateOverviewLazy()
    })
  }

  const scheduleEventInbox = () => {
    batcher.schedule([...officeKeys.root, "event-inbox"], () => {
      invalidateEventInboxQueries(qc, "active")
    })
  }

  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "transactions" },
    () => {
      health.lastEventAt = Date.now()
      emit()
      scheduleTransactions()
    },
  )

  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "transactions" },
    (p) => {
      health.lastEventAt = Date.now()
      emit()
      scheduleTransactions((p.new ?? {}) as Record<string, unknown>)
    },
  )

  channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "users" },
    () => {
      health.lastEventAt = Date.now()
      emit()
      scheduleUsers()
    },
  )

  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "users" },
    () => {
      health.lastEventAt = Date.now()
      emit()
      scheduleUsers()
    },
  )

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "wallet_balances" },
    () => {
      health.lastEventAt = Date.now()
      emit()
      batcher.schedule(officeKeys.root, () => {
        invalidateOverviewLazy()
      })
    },
  )

  for (const table of ["businesses", "business_customers", "invoices", "terminal_sessions"] as const) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        health.lastEventAt = Date.now()
        emit()
        scheduleMerchant()
      },
    )
  }

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "event_inbox" },
    () => {
      health.lastEventAt = Date.now()
      emit()
      scheduleEventInbox()
    },
  )

  channel.subscribe((status, err) => {
    health.subscribed = status === "SUBSCRIBED"
    if (err) health.lastError = err
    emit()
  })

  return () => {
    batcher.flush()
    try {
      channel.unsubscribe()
    } catch {
      // noop
    }
    try {
      supabase.removeChannel(channel)
    } catch {
      // noop
    }
    health.subscribed = false
    emit()
  }
}
