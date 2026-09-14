import type { SupabaseClient } from "@supabase/supabase-js"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { settlementAssetForPayoutProvider } from "@easner/shared"

export async function executeBridgeBalancePayoutTurnkeyLeg(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  transactionId: string
  easnerPayoutId: string
  fundingAddress: string
  cryptoAmount: number
  totalDebited: number
  formSessionId: string
  receiveCurrency: string
  sourceBalanceCurrency: string
}): Promise<{ ok: boolean; txHash: string | null; turnkeySendId?: string | null; error?: string }> {
  const destinationAddress = String(input.fundingAddress || "").trim()
  const amount = Number(input.cryptoAmount)
  if (!destinationAddress || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, txHash: null, error: "invalid_bridge_turnkey_send_input" }
  }
  const asset = settlementAssetForPayoutProvider("bridge", input.receiveCurrency) === "EURC" ? "EURC" : "USDC"

  let send: Awaited<ReturnType<typeof createTurnkeySend>>
  try {
    send = await createTurnkeySend(input.admin, {
      ctx: input.ctx,
      asset,
      chain: "solana",
      destinationAddress,
      amount,
      settlementPollTimeoutMs: 0,
      globalPayout: {
        easnerPayoutId: input.easnerPayoutId,
        formSessionId: input.formSessionId,
        walletDebitAmount: input.totalDebited,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "turnkey_send_failed"
    return { ok: false, txHash: null, error: msg }
  }

  const { data: existing } = await input.admin
    .from("transactions")
    .select("id,user_id,business_id,metadata,amount,provider,provider_transaction_id,status")
    .eq("id", input.transactionId)
    .maybeSingle()

  if (existing?.id) {
    const prior =
      existing.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {}
    await upsertLedgerTransaction(input.admin, {
      userId: String(existing.user_id),
      businessId: existing.business_id ? String(existing.business_id) : null,
      provider: "bridge",
      providerTransactionId: String(existing.provider_transaction_id ?? prior.bridge_transfer_id ?? existing.id),
      status: String(existing.status ?? "pending"),
      amount: Number(existing.amount ?? 0),
      currency: input.sourceBalanceCurrency,
      direction: "out",
      metadata: {
        ...prior,
        turnkey_send_id: send.providerTransactionId,
        turnkey_send_status: send.status,
        bridge_funding_tx_hash: send.txHash,
      },
      baseCurrency: input.sourceBalanceCurrency,
      asset,
    })
  }

  if (send.status === "failed") {
    return {
      ok: false,
      txHash: send.txHash,
      turnkeySendId: send.providerTransactionId,
      error: send.chainFailureDetail?.trim() || "turnkey_send_failed",
    }
  }

  return {
    ok: true,
    txHash: send.txHash,
    turnkeySendId: send.providerTransactionId,
  }
}
