"use client"

import { useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { markRecentMoneyActivity, qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"

const LEDGER_SCOPE_HEADERS = { "X-Easner-Noah-Scope": "business" } as const
const MIN_REPAIR_INTERVAL_MS = 10 * 60_000

let lastLedgerRepairAt = 0
let ledgerRepairInFlight: Promise<boolean> | null = null

export function useTurnkeyLedgerRepair() {
  const qc = useQueryClient()
  const { scope } = useScope()

  const runRepairIfDue = useCallback(
    async (force = false): Promise<boolean> => {
      if (!scope) return false
      const now = Date.now()
      if (!force && now - lastLedgerRepairAt < MIN_REPAIR_INTERVAL_MS) return false
      if (ledgerRepairInFlight) return ledgerRepairInFlight

      const run = (async () => {
        try {
          const body = await apiFetch<{ result?: { upserted?: number } }>(
            "/api/wallets/sync-chain-ledger",
            { method: "POST", headers: LEDGER_SCOPE_HEADERS },
          )
          lastLedgerRepairAt = Date.now()
          const upserted = Number(body?.result?.upserted ?? 0)
          const inserted = Number.isFinite(upserted) && upserted > 0
          if (inserted) {
            markRecentMoneyActivity()
            await Promise.all([
              qc.invalidateQueries({ queryKey: qk.transactions.list(scope, {}) }),
              qc.invalidateQueries({ queryKey: qk.wallets.root(scope) }),
            ])
          }
          return inserted
        } catch {
          return false
        } finally {
          ledgerRepairInFlight = null
        }
      })()

      ledgerRepairInFlight = run
      return run
    },
    [qc, scope],
  )

  useEffect(() => {
    void runRepairIfDue(false)
  }, [runRepairIfDue])

  return { runRepairIfDue }
}
