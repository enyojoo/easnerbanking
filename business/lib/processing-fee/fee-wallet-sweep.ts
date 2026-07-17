import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeEasnerRevenueFeeWalletSweepAmount,
  EASNER_REVENUE_FEE_WALLET_SWEEP_MIN,
} from "@easner/shared"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { sendStablecoinFromDepositOmnibus } from "@/lib/turnkey/send-from-omnibus"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"

export { EASNER_REVENUE_FEE_WALLET_SWEEP_MIN as FEE_SWEEP_MIN }

export type EasnerRevenueSweepMetadataPatch = {
  fee_wallet_sweep?: number
  fee_wallet_sweep_tx_hash?: string
  easner_revenue_sweep_amount?: number
  processing_fee_pending?: boolean
  processing_fee_captured_at?: string
  processing_fee_turnkey_send_id?: string
  margin_turnkey_send_id?: string
}

function assetForCryptoSymbol(crypto: string): "USDC" | "EURC" {
  return String(crypto || "").toUpperCase().includes("EUR") ? "EURC" : "USDC"
}

export function computeSweepAmountFromMetadata(
  meta: Record<string, unknown>,
  opts?: { ledgerSurplus?: number; rowAmount?: number },
): number {
  return computeEasnerRevenueFeeWalletSweepAmount({
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
    totalDebited: Number(meta.total_debited ?? opts?.rowAmount ?? 0),
    cryptoAuthorizedAmount: Number(meta.crypto_authorized_amount ?? meta.noah_send_amount ?? 0),
    ...(opts?.ledgerSurplus != null ? { ledgerSurplus: opts.ledgerSurplus } : {}),
  })
}

export function buildEasnerRevenueSweepMetadataPatch(input: {
  sweepAmt: number
  feeWalletSweepTxHash: string | null
  captured: boolean
  turnkeySendId?: string | null
  useMarginTurnkeySendId?: boolean
}): EasnerRevenueSweepMetadataPatch {
  const now = new Date().toISOString()
  const patch: EasnerRevenueSweepMetadataPatch = {
    ...(input.sweepAmt > 0 ? { fee_wallet_sweep: input.sweepAmt, easner_revenue_sweep_amount: input.sweepAmt } : {}),
    ...(input.feeWalletSweepTxHash ? { fee_wallet_sweep_tx_hash: input.feeWalletSweepTxHash } : {}),
    processing_fee_pending: !input.captured && input.sweepAmt >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN,
    ...(input.captured && input.sweepAmt >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN
      ? { processing_fee_captured_at: now }
      : {}),
  }
  if (input.turnkeySendId) {
    if (input.useMarginTurnkeySendId) {
      patch.margin_turnkey_send_id = input.turnkeySendId
    } else {
      patch.processing_fee_turnkey_send_id = input.turnkeySendId
    }
  }
  return patch
}

export async function sweepEasnerRevenueFromDepositOmnibus(input: {
  ledgerCurrency: "USD" | "EUR"
  amount: number
  logTag?: string
}): Promise<{
  feeWalletSweepTxHash: string | null
  captured: boolean
  turnkeySendId: string | null
}> {
  const sweepAmt = Number(input.amount)
  if (!Number.isFinite(sweepAmt) || sweepAmt < EASNER_REVENUE_FEE_WALLET_SWEEP_MIN) {
    return { feeWalletSweepTxHash: null, captured: true, turnkeySendId: null }
  }

  const feeAddr = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: input.ledgerCurrency })
  if (!feeAddr) {
    return { feeWalletSweepTxHash: null, captured: false, turnkeySendId: null }
  }

  const asset = input.ledgerCurrency === "EUR" ? "EURC" : "USDC"
  const sweep = await sendStablecoinFromDepositOmnibus({
    ledgerCurrency: input.ledgerCurrency,
    asset,
    destinationAddress: feeAddr,
    amount: sweepAmt,
    pollForSettlement: false,
  }).catch((e) => {
    console.warn(`[${input.logTag ?? "easner-revenue-sweep"}] omnibus fee sweep failed (non-fatal):`, e)
    return null
  })

  const feeWalletSweepTxHash = sweep?.txHash ?? null
  const captured =
    sweep?.status === "skipped" || sweep?.status === "settled" || Boolean(feeWalletSweepTxHash)

  return {
    feeWalletSweepTxHash,
    captured,
    turnkeySendId: sweep?.providerTransactionId ?? null,
  }
}

export async function sweepEasnerRevenueFromUserTurnkeyWallet(
  admin: SupabaseClient,
  input: {
    ctx: NoahAccountContext
    ledgerCurrency: "USD" | "EUR"
    amount: number
    asset?: "USDC" | "EURC"
    cryptoAssetHint?: string
    globalPayout?: {
      easnerPayoutId: string
      noahWorkflowId?: string | null
      formSessionId?: string
    }
    walletSend?: { formSessionId: string }
    logTag?: string
  },
): Promise<{
  feeWalletSweepTxHash: string | null
  captured: boolean
  turnkeySendId: string | null
}> {
  const sweepAmt = Number(input.amount)
  if (!Number.isFinite(sweepAmt) || sweepAmt < EASNER_REVENUE_FEE_WALLET_SWEEP_MIN) {
    return { feeWalletSweepTxHash: null, captured: true, turnkeySendId: null }
  }

  const feeAddress = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: input.ledgerCurrency })
  if (!feeAddress) {
    return { feeWalletSweepTxHash: null, captured: false, turnkeySendId: null }
  }

  const asset =
    input.asset ??
    assetForCryptoSymbol(input.cryptoAssetHint ?? (input.ledgerCurrency === "EUR" ? "EURC" : "USDC"))

  try {
    const feeSend = await createTurnkeySend(admin, {
      ctx: input.ctx,
      asset,
      chain: "solana",
      destinationAddress: feeAddress,
      amount: sweepAmt,
      settlementPollTimeoutMs: 0,
      ...(input.globalPayout
        ? {
            globalPayout: {
              easnerPayoutId: input.globalPayout.easnerPayoutId,
              noahWorkflowId: input.globalPayout.noahWorkflowId,
              formSessionId: input.globalPayout.formSessionId,
              walletDebitAmount: 0,
              marginLeg: true,
            },
          }
        : {}),
      ...(input.walletSend ? { walletSend: { formSessionId: input.walletSend.formSessionId, marginLeg: true } } : {}),
    })

    const captured = feeSend.status !== "failed"
    return {
      feeWalletSweepTxHash: feeSend.txHash,
      captured,
      turnkeySendId: feeSend.providerTransactionId,
    }
  } catch (e) {
    console.warn(`[${input.logTag ?? "easner-revenue-sweep"}] user wallet fee sweep failed:`, e)
    return { feeWalletSweepTxHash: null, captured: false, turnkeySendId: null }
  }
}

export function isEasnerRevenueAlreadySwept(meta: Record<string, unknown>): boolean {
  return Boolean(String(meta.fee_wallet_sweep_tx_hash ?? "").trim())
}

export function readPriorSweepFromMetadata(meta: Record<string, unknown>): {
  sweepAmt: number
  feeWalletSweepTxHash: string | null
  captured: boolean
} {
  if (!isEasnerRevenueAlreadySwept(meta)) {
    return { sweepAmt: 0, feeWalletSweepTxHash: null, captured: false }
  }
  return {
    sweepAmt: Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? 0),
    feeWalletSweepTxHash: String(meta.fee_wallet_sweep_tx_hash),
    captured: true,
  }
}
