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

  const invalidateOverview = () => {
    for (const preset of OVERVIEW_PRESETS) {
      qc.invalidateQueries({ queryKey: officeKeys.overview(preset), refetchType: "active" })
    }
  }

  const channel = supabase.channel("office:admin", { config: { broadcast: { self: false } } })

  const scheduleTransactions = () => {
    batcher.schedule(officeKeys.transactions(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.transactions(), refetchType: "active" })
      invalidateOverview()
    })
  }

  const scheduleUsers = () => {
    batcher.schedule(officeKeys.users(), () => {
      qc.invalidateQueries({ queryKey: officeKeys.users(), refetchType: "active" })
      invalidateOverview()
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
    () => {
      health.lastEventAt = Date.now()
      emit()
      scheduleTransactions()
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
        invalidateOverview()
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
