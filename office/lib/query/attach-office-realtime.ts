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
  return ["completed", "settled", "deposited", "confirmed", "failed", "cancelled", "canceled"].includes(
    status,
  )
}

type OfficeTransactionDetailCache = {
  transaction: {
    id: string
    status: string
    easner_transaction_id?: string | null
    provider_transaction_id?: string | null
    updated_at?: string
    occurred_at?: string | null
  }
  ops: {
    rawStatus: string
    updatedAt?: string | null
    occurredAt?: string | null
  }
}

function patchOfficeTransactionDetailInCache(qc: QueryClient, row: Record<string, unknown>): boolean {
  const ledgerId = row.id != null ? String(row.id) : ""
  if (!ledgerId) return false
  const etid = row.easner_transaction_id != null ? String(row.easner_transaction_id) : ""
  const ptid = row.provider_transaction_id != null ? String(row.provider_transaction_id) : ""

  let patched = false
  const queries = qc.getQueriesData<OfficeTransactionDetailCache>({
    queryKey: [...officeKeys.transactionsRoot(), "detail"],
  })
  for (const [queryKey, prev] of queries) {
    if (!prev?.transaction || !prev.ops) continue
    const tx = prev.transaction
    const matches =
      tx.id === ledgerId ||
      (etid && tx.easner_transaction_id === etid) ||
      (ptid && tx.provider_transaction_id === ptid)
    if (!matches) continue
    const status = row.status != null ? String(row.status) : tx.status
    qc.setQueryData(queryKey, {
      ...prev,
      transaction: {
        ...tx,
        status,
        updated_at: row.updated_at != null ? String(row.updated_at) : tx.updated_at,
        occurred_at: row.occurred_at != null ? String(row.occurred_at) : tx.occurred_at,
      },
      ops: {
        ...prev.ops,
        rawStatus: status,
        updatedAt: row.updated_at != null ? String(row.updated_at) : prev.ops.updatedAt,
        occurredAt: row.occurred_at != null ? String(row.occurred_at) : prev.ops.occurredAt,
      },
    })
    patched = true
  }
  return patched
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

  const detailPatched = patchOfficeTransactionDetailInCache(qc, row)
  return infinitePatched || flatPatched || detailPatched
}

function upsertOfficeDirectoryRow(
  qc: QueryClient,
  queryKey: readonly unknown[],
  row: Record<string, unknown>,
  decorate?: (merged: Record<string, unknown>) => Record<string, unknown>,
): boolean {
  const id = row.id != null ? String(row.id) : ""
  if (!id) return false
  const prev = qc.getQueryData<Record<string, unknown>[]>(queryKey)
  if (!Array.isArray(prev)) return false
  const idx = prev.findIndex((r) => String(r?.id ?? "") === id)
  const base = idx >= 0 ? prev[idx] : {}
  let merged: Record<string, unknown> = { ...base, ...row, id }
  if (decorate) merged = decorate(merged)
  const next = idx >= 0 ? prev.map((r, i) => (i === idx ? merged : r)) : [merged, ...prev]
  qc.setQueryData(queryKey, next)
  return true
}

function decorateOfficeUserRow(merged: Record<string, unknown>): Record<string, unknown> {
  const noahKycStatus = String(merged.noah_kyc_status ?? merged.noahKycStatus ?? "not_started")
  return {
    ...merged,
    noahKycStatus,
    verificationStatus: noahKycStatus === "approved" ? "verified" : "pending",
  }
}

function invalidateOverview(qc: QueryClient, refetchType: "active" | "inactive" = "active"): void {
  for (const preset of OVERVIEW_PRESETS) {
    qc.invalidateQueries({ queryKey: officeKeys.overview(preset), refetchType })
  }
}

function invalidateAllTransactionQueries(qc: QueryClient, refetchType: "active" | "inactive" = "active"): void {
  qc.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_PREFIX, refetchType })
  qc.invalidateQueries({ queryKey: [...officeKeys.root, "user-transactions"], refetchType })
}

function invalidateMerchantQueries(qc: QueryClient, refetchType: "active" | "inactive" = "active"): void {
  qc.invalidateQueries({ queryKey: officeKeys.businesses(), refetchType })
  qc.invalidateQueries({ queryKey: officeKeys.businessCustomers(), refetchType })
  qc.invalidateQueries({ queryKey: officeKeys.businessInvoices(), refetchType })
  qc.invalidateQueries({ queryKey: officeKeys.terminalSessions(), refetchType })
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

  const invalidateOverviewNow = () => invalidateOverview(qc, "active")

  const channel = supabase.channel("office:admin", { config: { broadcast: { self: false } } })

  const markEvent = () => {
    health.lastEventAt = Date.now()
    emit()
  }

  const listen = (
    table: string,
    event: "*" | "INSERT" | "UPDATE",
    handler: (row: Record<string, unknown>) => void,
  ) => {
    channel.on("postgres_changes", { event, schema: "public", table }, (payload) => {
      markEvent()
      handler((payload.new ?? {}) as Record<string, unknown>)
    })
  }

  const schedule = (key: readonly unknown[], fn: () => void) => {
    batcher.schedule(key, fn)
  }

  const scheduleTransactions = (row?: Record<string, unknown>) => {
    schedule(TRANSACTIONS_QUERY_PREFIX, () => {
      invalidateOverviewNow()
      if (row && shouldInvalidateTransactionUpdate(row)) {
        invalidateAllTransactionQueries(qc, "active")
        return
      }
      if (row && patchOfficeTransactionInCache(qc, row)) {
        return
      }
      invalidateAllTransactionQueries(qc, "active")
    })
  }

  const scheduleUsers = (row?: Record<string, unknown>) => {
    schedule(officeKeys.users(), () => {
      if (row) upsertOfficeDirectoryRow(qc, officeKeys.users(), row, decorateOfficeUserRow)
      qc.invalidateQueries({ queryKey: officeKeys.users(), refetchType: "active" })
      invalidateOverviewNow()
    })
  }

  const scheduleMerchant = (row?: Record<string, unknown>) => {
    schedule(officeKeys.businesses(), () => {
      if (row?.id != null) upsertOfficeDirectoryRow(qc, officeKeys.businesses(), row)
      invalidateMerchantQueries(qc, "active")
      // Users directory merges org KYB / linked business name.
      qc.invalidateQueries({ queryKey: officeKeys.users(), refetchType: "active" })
      invalidateOverviewNow()
    })
  }

  listen("transactions", "INSERT", () => scheduleTransactions())
  listen("transactions", "UPDATE", (row) => scheduleTransactions(row))
  listen("users", "INSERT", (row) => scheduleUsers(row))
  listen("users", "UPDATE", (row) => scheduleUsers(row))
  listen("wallet_balances", "*", () => {
    schedule(officeKeys.overviewRoot(), invalidateOverviewNow)
  })

  listen("businesses", "*", (row) => scheduleMerchant(row))
  for (const table of ["business_customers", "invoices", "terminal_sessions", "business_kyb_applications"] as const) {
    listen(table, "*", () => scheduleMerchant())
  }

  listen("event_inbox", "*", () => {
    schedule(officeKeys.eventInboxRoot(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.eventInboxRoot(), refetchType: "active" })
    })
  })

  listen("account_statements", "*", () => {
    schedule(officeKeys.statementsRoot(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.statementsRoot(), refetchType: "active" })
    })
  })

  listen("system_settings", "*", () => {
    schedule(officeKeys.systemSettings(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.systemSettings(), refetchType: "active" })
    })
  })

  listen("currencies", "*", () => {
    schedule(officeKeys.currenciesRoot(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.currenciesRoot(), refetchType: "active" })
    })
  })

  listen("exchange_rates", "*", () => {
    schedule(officeKeys.currenciesRoot(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.currenciesRoot(), refetchType: "active" })
    })
  })

  const rateTables: Array<{ table: string; key: readonly unknown[] }> = [
    { table: "noah_rates", key: officeKeys.noahRates() },
    { table: "yellowcard_rates", key: officeKeys.ycRates() },
    { table: "grid_rates", key: officeKeys.gridRates() },
    { table: "crypto_rates", key: officeKeys.cryptoRates() },
    { table: "payout_corridors", key: officeKeys.payoutCorridors() },
    { table: "crypto_destinations", key: officeKeys.cryptoDestinations() },
  ]
  for (const { table, key } of rateTables) {
    listen(table, "*", () => {
      schedule(key, () => {
        qc.invalidateQueries({ queryKey: [...key], refetchType: "active" })
      })
    })
  }

  listen("processing_fee_schedule", "*", () => {
    schedule(officeKeys.processingFeeScheduleRoot(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.processingFeeScheduleRoot(), refetchType: "active" })
    })
  })

  listen("processing_fee_overrides", "*", () => {
    schedule(officeKeys.processingFeeOverrideRoot(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.processingFeeOverrideRoot(), refetchType: "active" })
    })
  })

  listen("business_checkout_fee_overrides", "*", () => {
    schedule(officeKeys.businesses(), () => {
      invalidateMerchantQueries(qc, "active")
    })
  })

  let hadSubscribed = false
  channel.subscribe((status, err) => {
    const wasSubscribed = health.subscribed
    health.subscribed = status === "SUBSCRIBED"
    if (health.subscribed) {
      health.lastError = null
      if (hadSubscribed && !wasSubscribed) {
        qc.invalidateQueries({ queryKey: officeKeys.root, refetchType: "active" })
      }
      hadSubscribed = true
    } else if (err) {
      health.lastError = err
    }
    emit()
  })

  const heartbeat = setInterval(emit, 30_000)

  return () => {
    clearInterval(heartbeat)
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
