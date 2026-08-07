"use client"

import { useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { markRecentMoneyActivity, qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { shouldRefreshAfterChainLedgerSync } from "@/lib/turnkey/sync-chain-ledger-response"

const LEDGER_SCOPE_HEADERS = { "X-Easner-Account-Scope": "business" } as const
/** Minimum gap between full server-side scans; ATA + light ingest still run every call. */
const MIN_FULL_SCAN_INTERVAL_MS = 10 * 60_000

let lastFullScanAt = 0
let ledgerRepairInFlight: Promise<boolean> | null = null

export function useTurnkeyLedgerRepair() {
  const qc = useQueryClient()
  const { scope } = useScope()

  const runRepairIfDue = useCallback(
    async (force = false): Promise<boolean> => {
      if (!scope) return false
      if (ledgerRepairInFlight) return ledgerRepairInFlight
      const now = Date.now()
      if (!force && now - lastFullScanAt < MIN_FULL_SCAN_INTERVAL_MS) {
        // Still hit the API so cooldown path can refresh ATA balances + recent deposits.
      }

      const run = (async () => {
        try {
          const body = await apiFetch<Record<string, unknown>>(
            "/api/wallets/sync-chain-ledger",
            { method: "POST", headers: LEDGER_SCOPE_HEADERS },
          )
          if (!body.skipped) lastFullScanAt = now
          const inserted = shouldRefreshAfterChainLedgerSync(body)
          if (inserted) {
            markRecentMoneyActivity()
            await Promise.all([
              qc.invalidateQueries({ queryKey: qk.transactions.root(scope) }),
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
