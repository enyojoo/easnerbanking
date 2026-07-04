import type { SupabaseClient } from "@supabase/supabase-js"
import type { NormalizedTurnkeyBalanceDeposit } from "@/lib/turnkey/turnkey-balance-webhook-payload"
import {
  isDepositOmnibusAddress,
  isDepositSplitEnabled,
} from "@/lib/deposit-omnibus/config"
import { findBankOnrampPayInTransaction } from "@/lib/noah/find-bank-onramp-pay-in-transaction"
import { triggerDepositSplit } from "@/lib/deposit-omnibus/execute-deposit-split"

function ledgerCurrencyFromAsset(asset: string): "USD" | "EUR" {
  return String(asset || "").toUpperCase().includes("EURC") ? "EUR" : "USD"
}

/**
 * Omnibus Turnkey balance webhook — enqueue and run split immediately.
 */
export async function handleDepositOmnibusInbound(
  admin: SupabaseClient,
  deposit: NormalizedTurnkeyBalanceDeposit,
  _eventId: string,
): Promise<boolean> {
  if (!isDepositSplitEnabled()) return false
  if (!isDepositOmnibusAddress(deposit.address)) return false

  const txHash = deposit.txHash ? String(deposit.txHash).trim() : null
  if (!txHash) return false

  let q = admin
    .from("transactions")
    .select("id, user_id, business_id, metadata")
    .eq("provider", "noah")
    .eq("direction", "out")
    .eq("tx_hash", txHash)
  const { data: orchOut } = await q.maybeSingle()

  const ruleExecutionId =
    orchOut?.metadata && typeof orchOut.metadata === "object"
      ? String((orchOut.metadata as Record<string, unknown>).noah_rule_execution_id ?? "").trim()
      : ""

  if (!ruleExecutionId || !orchOut?.user_id) {
    console.warn("[handleDepositOmnibusInbound] no orchestration out match for omnibus deposit", {
      txHash,
    })
    return false
  }

  const userId = String(orchOut.user_id)
  const businessId = orchOut.business_id ? String(orchOut.business_id) : null

  await triggerDepositSplit(admin, {
    ruleExecutionId,
    userId,
    businessId,
    omnibusInboundTxHash: txHash,
    omnibusReceived: deposit.amount,
  })

  return true
}

export async function triggerDepositSplitFromOrchestrationOut(
  admin: SupabaseClient,
  opts: {
    ruleExecutionId: string
    userId: string
    businessId: string | null
    solanaTxHash: string
    amount?: number | null
  },
): Promise<void> {
  if (!isDepositSplitEnabled()) return

  const payIn = await findBankOnrampPayInTransaction(admin, {
    depositId: opts.ruleExecutionId,
    userId: opts.userId,
    businessId: opts.businessId,
  })
  if (!payIn?.id) return

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...payIn.metadata,
        noah_on_chain_tx_hash: opts.solanaTxHash,
        deposit_split_status: "pending",
      },
      tx_hash: opts.solanaTxHash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payIn.id)

  await triggerDepositSplit(admin, {
    ruleExecutionId: opts.ruleExecutionId,
    userId: opts.userId,
    businessId: opts.businessId,
    omnibusInboundTxHash: opts.solanaTxHash,
    omnibusReceived: opts.amount ?? null,
  })
}
