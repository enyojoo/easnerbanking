import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { executeYcCryptoDeposit } from "@/lib/yellowcard/execute-yc-crypto-deposit"
import { captureGlobalPayoutProcessingFeeIfPending } from "@/lib/processing-fee/capture-pending-processing-fee"
import { reverseGlobalPayoutWalletDebitForEasnerPayoutId } from "@/lib/noah/global-payout-ledger"

/**
 * After ledger debit + YC POST /send: deposit USDC from omnibus to YC wallet.
 */
export async function executeYcBalancePayoutCryptoLeg(input: {
  transactionId: string
  ycWalletAddress: string
  cryptoAmountUsd: number
}): Promise<{ ok: boolean; txHash: string | null; error?: string }> {
  const deposit = await executeYcCryptoDeposit({
    ycWalletAddress: input.ycWalletAddress,
    cryptoAmountUsd: input.cryptoAmountUsd,
    pollForSettlement: true,
  })

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", input.transactionId)
    .maybeSingle()
  const prior =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {}
  await admin
    .from("transactions")
    .update({
      metadata: {
        ...prior,
        yc_crypto_deposit_status: deposit.status,
        yc_crypto_deposit_tx_hash: deposit.txHash,
        yc_crypto_deposit_provider_id: deposit.providerTransactionId,
        yc_crypto_deposit_error: deposit.errorMessage,
        suppress_in_feed: true,
        yc_crypto_deposit_leg: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.transactionId)

  if (deposit.status === "failed") {
    return { ok: false, txHash: null, error: deposit.errorMessage ?? "yc_crypto_deposit_failed" }
  }
  return { ok: true, txHash: deposit.txHash }
}

export async function handleYcBalancePayoutSendComplete(input: {
  transactionId: string
  userId: string
  businessId: string | null
}): Promise<void> {
  const admin = createSupabaseAdmin()
  await admin
    .from("transactions")
    .update({
      status: "settled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.transactionId)

  await captureGlobalPayoutProcessingFeeIfPending(admin, {
    transactionId: input.transactionId,
    userId: input.userId,
    businessId: input.businessId,
  })
}

/**
 * On SEND.FAILED for balance_payout: USDC refunds to user wallet; reverse ledger debit.
 */
export async function handleYcBalancePayoutSendFailed(input: {
  easnerPayoutId: string
}): Promise<void> {
  const admin = createSupabaseAdmin()
  await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
    easnerPayoutId: input.easnerPayoutId,
  })
}
