/**
 * Platform-wide Supabase Realtime → TanStack Query bridge for Easner Office.
 */

import type { QueryClient } from "@tanstack/react-query"
import {
  createBatcher,
  type RealtimeHealth,
  type SupabaseLikeClient,
} from "@easner/shared"
import { officeKeys } from "./keys"

const OVERVIEW_PRESETS = ["7d", "30d", "90d", "1y", "all"] as const

type OfficeTransactionsCache = {
  transactions: Array<{
    id: string
    status: string
    updated_at?: string
    occurred_at?: string | null
  }>
  summary?: unknown
}

function patchOfficeTransactionInCache(
  qc: QueryClient,
  row: Record<string, unknown>,
): boolean {
  const id = row.id != null ? String(row.id) : ""
  if (!id) return false

  let patched = false
  qc.setQueryData<OfficeTransactionsCache>(officeKeys.transactions(), (prev) => {
    if (!prev?.transactions?.length) return prev
    let changed = false
    const transactions = prev.transactions.map((tx) => {
      if (tx.id !== id) return tx
      changed = true
      return {
        ...tx,
        status: String(row.status ?? tx.status),
        updated_at: row.updated_at != null ? String(row.updated_at) : tx.updated_at,
        occurred_at: row.occurred_at != null ? String(row.occurred_at) : tx.occurred_at,
      }
    })
    if (!changed) return prev
    patched = true
    return { ...prev, transactions }
  })
  return patched
}

function invalidateOverview(qc: QueryClient, refetchType: "active" | "inactive" = "inactive"): void {
  for (const preset of OVERVIEW_PRESETS) {
    qc.invalidateQueries({ queryKey: officeKeys.overview(preset), refetchType })
  }
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
    batcher.schedule(officeKeys.transactions(), () => {
      if (row && patchOfficeTransactionInCache(qc, row)) {
        invalidateOverviewLazy()
        return
      }
      qc.invalidateQueries({ queryKey: officeKeys.transactions(), refetchType: "active" })
      invalidateOverviewLazy()
    })
  }

  const scheduleUsers = () => {
    batcher.schedule(officeKeys.users(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.users(), refetchType: "active" })
      invalidateOverviewLazy()
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
