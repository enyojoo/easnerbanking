import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isNoahBankOnrampOrchestrationOutLeg,
  pickNoahOrchestrationRuleExecutionId,
} from "@/lib/noah/bank-onramp-tx"
import { pickNoahOnChainTxHashFromLedgerRow } from "@/lib/noah/noah-on-chain-tx-hash"

export type BankOnrampOrchestrationOutTimestamps = {
  onChainSettledAt: string | null
  solanaTxHash: string | null
}

const ORCH_OUT_WEBHOOK_SCAN_LIMIT = 3000

function emptyTimestamps(): BankOnrampOrchestrationOutTimestamps {
  return { onChainSettledAt: null, solanaTxHash: null }
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function matchesRuleExecution(tx: Record<string, unknown>, ruleExecutionId: string): boolean {
  return pickNoahOrchestrationRuleExecutionId(tx) === ruleExecutionId
}

/**
 * Noah bank on-ramp orchestration Out (Solana → user wallet) Settled time from `event_inbox`.
 */
export async function fetchBankOnrampOrchestrationOutFromWebhooks(
  admin: SupabaseClient,
  ruleExecutionId: string,
): Promise<BankOnrampOrchestrationOutTimestamps> {
  const key = String(ruleExecutionId || "").trim()
  if (!key) return emptyTimestamps()

  const { data, error } = await admin
    .from("event_inbox")
    .select("payload, received_at")
    .eq("provider", "noah")
    .eq("event_type", "Transaction")
    .order("received_at", { ascending: true })
    .limit(ORCH_OUT_WEBHOOK_SCAN_LIMIT)

  if (error || !data) return emptyTimestamps()

  let onChainSettledAt: string | null = null
  let solanaTxHash: string | null = null

  for (const row of data) {
    const envelope = row.payload as Record<string, unknown> | undefined
    const tx = envelope?.Data as Record<string, unknown> | undefined
    if (!tx || !matchesRuleExecution(tx, key)) continue
    if (!isNoahBankOnrampOrchestrationOutLeg(tx)) continue

    const status = String(tx.Status ?? "").toLowerCase()
    if (status === "settled") {
      onChainSettledAt =
        pickIso(envelope?.Occurred, tx.Occurred, tx.Created, row.received_at) ??
        onChainSettledAt
      const hash = pickNoahOnChainTxHashFromLedgerRow({ payload: tx })
      if (hash) solanaTxHash = hash
    }
  }

  return { onChainSettledAt, solanaTxHash }
}
