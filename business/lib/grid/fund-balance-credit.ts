import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { maybeApplyVelocityControl } from "@/lib/wallet-send-compliance"

/** Credit wallet + settle Grid fund-balance pay-in on INCOMING webhook. */
export async function creditGridFundBalanceFromWebhook(
  admin: SupabaseClient,
  input: { transferId: string; transactionId: string },
): Promise<void> {
  const { data: transfer } = await admin
    .from("grid_transfers")
    .select("*")
    .eq("id", input.transferId)
    .maybeSingle()
  if (!transfer) return

  const usdCredit = Number(transfer.quoted_receive ?? 0)
  if (!(usdCredit > 0)) return

  const userId = String(transfer.user_id)
  const businessId = transfer.business_id ? String(transfer.business_id) : null

  let balQ = admin
    .from("wallet_balances")
    .select("id,available_balance")
    .eq("currency", "USD")
    .limit(1)
  if (businessId) balQ = balQ.eq("business_id", businessId)
  else balQ = balQ.eq("user_id", userId)
  const { data: bal } = await balQ.maybeSingle()

  const priorAvailable = Number(bal?.available_balance ?? 0)
  const nextAvailable = priorAvailable + usdCredit
  const now = new Date().toISOString()

  if (bal?.id) {
    await admin
      .from("wallet_balances")
      .update({ available_balance: nextAvailable, updated_at: now })
      .eq("id", bal.id)
  } else {
    await admin.from("wallet_balances").insert({
      user_id: businessId ? null : userId,
      business_id: businessId,
      currency: "USD",
      available_balance: usdCredit,
      updated_at: now,
    })
  }

  await maybeApplyVelocityControl(admin, {
    businessId,
    amountUsd: usdCredit,
    source: "grid_fund_balance",
    transactionId: input.transactionId,
    creditKey: `grid_fund_balance:${input.transferId}`,
  })

  const { data: tx } = await admin
    .from("transactions")
    .select("*")
    .eq("id", input.transactionId)
    .maybeSingle()

  if (tx?.id) {
    const prior =
      tx.metadata && typeof tx.metadata === "object" ? (tx.metadata as Record<string, unknown>) : {}
    await upsertLedgerTransaction(admin, {
      userId,
      businessId,
      provider: "grid",
      providerTransactionId: String(tx.provider_transaction_id ?? transfer.grid_quote_id ?? tx.id),
      status: "settled",
      amount: usdCredit,
      currency: "USD",
      direction: "in",
      metadata: { ...prior, grid_fund_balance_credited: true, credited_at: now },
      baseCurrency: "USD",
      asset: "USDC",
    })
  }

  await admin
    .from("grid_transfers")
    .update({ status: "settled", updated_at: now })
    .eq("id", input.transferId)
}
