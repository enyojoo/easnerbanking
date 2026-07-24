import type { SupabaseClient } from "@supabase/supabase-js"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"

/** Turnkey USDC → Grid JIT / funding address for balance payout. */
export async function executeGridBalancePayoutTurnkeyLeg(input: {
  admin: SupabaseClient
  ctx: NoahAccountContext
  transactionId: string
  easnerPayoutId: string
  fundingAddress: string
  cryptoAmountUsd: number
  totalDebited: number
  formSessionId: string
}): Promise<{ ok: boolean; txHash: string | null; turnkeySendId?: string | null; error?: string }> {
  const destinationAddress = String(input.fundingAddress || "").trim()
  const amount = Number(input.cryptoAmountUsd)
  if (!destinationAddress || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, txHash: null, error: "invalid_grid_turnkey_send_input" }
  }

  let send: Awaited<ReturnType<typeof createTurnkeySend>>
  try {
    send = await createTurnkeySend(input.admin, {
      ctx: input.ctx,
      asset: "USDC",
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
      provider: "grid",
      providerTransactionId: String(existing.provider_transaction_id ?? prior.grid_quote_id ?? existing.id),
      status: String(existing.status ?? "pending"),
      amount: Number(existing.amount ?? 0),
      currency: "USD",
      direction: "out",
      metadata: {
        ...prior,
        turnkey_send_id: send.providerTransactionId,
        turnkey_send_status: send.status,
        grid_funding_tx_hash: send.txHash,
      },
      baseCurrency: "USD",
      asset: "USDC",
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
