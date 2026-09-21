import {
  computeEasnerRevenueFeeWalletSweepAmount,
  EASNER_REVENUE_FEE_WALLET_SWEEP_MIN,
  payoutCryptoAuthorizedAmountFromMeta,
} from "@easner/shared"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"

/** Submitted fee Turnkey sends older than this can be retried (blockhash expiry). */
export const FEE_SWEEP_STALE_MS = 10 * 60 * 1000

export { EASNER_REVENUE_FEE_WALLET_SWEEP_MIN as FEE_SWEEP_MIN }

export type EasnerRevenueSweepMetadataPatch = {
  fee_wallet_sweep?: number
  fee_wallet_sweep_tx_hash?: string
  easner_revenue_sweep_amount?: number
  processing_fee_pending?: boolean
  processing_fee_captured_at?: string
  processing_fee_submitted_at?: string
  processing_fee_turnkey_send_id?: string
  margin_turnkey_send_id?: string
  processing_fee_turnkey_send_status?: string
  fee_destination_address?: string
}

export function isTurnkeyFeeSweepOnChain(input: {
  status: string | null | undefined
  txHash: string | null | undefined
}): boolean {
  if (String(input.txHash ?? "").trim()) return true
  return String(input.status ?? "").toLowerCase() === "settled"
}

export function readFeeTurnkeySendId(meta: Record<string, unknown>): string {
  return String(meta.processing_fee_turnkey_send_id ?? meta.margin_turnkey_send_id ?? "").trim()
}

export function isPayoutPrincipalOnChain(meta: Record<string, unknown>): boolean {
  if (
    String(
      meta.turnkey_tx_hash ?? meta.yc_crypto_deposit_tx_hash ?? meta.grid_funding_tx_hash ?? "",
    ).trim()
  ) {
    return true
  }
  const status = String(meta.yc_crypto_deposit_status ?? meta.turnkey_send_status ?? "").toLowerCase()
  return status === "settled"
}

export function isSubmittedFeeSweepStale(meta: Record<string, unknown>, nowMs = Date.now()): boolean {
  const at = String(meta.processing_fee_submitted_at ?? meta.processing_fee_captured_at ?? "").trim()
  if (!at) return false
  const ts = Date.parse(at)
  if (!Number.isFinite(ts)) return false
  return nowMs - ts >= FEE_SWEEP_STALE_MS
}

export function computeSweepAmountFromMetadata(
  meta: Record<string, unknown>,
  opts?: { ledgerSurplus?: number; rowAmount?: number },
): number {
  return computeEasnerRevenueFeeWalletSweepAmount({
    marginAmount: Number(meta.margin_amount ?? 0),
    processingFee: Number(meta.processing_fee ?? 0),
    totalDebited: Number(meta.total_debited ?? opts?.rowAmount ?? 0),
    cryptoAuthorizedAmount: Number(payoutCryptoAuthorizedAmountFromMeta(meta) ?? 0),
    ...(opts?.ledgerSurplus != null ? { ledgerSurplus: opts.ledgerSurplus } : {}),
  })
}

export function buildEasnerRevenueSweepMetadataPatch(input: {
  sweepAmt: number
  feeWalletSweepTxHash: string | null
  captured: boolean
  turnkeySendId?: string | null
  useMarginTurnkeySendId?: boolean
  ledgerCurrency?: "USD" | "EUR"
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
    patch.processing_fee_turnkey_send_status = input.captured ? "settled" : "pending"
    patch.processing_fee_submitted_at = now
  }
  if (input.ledgerCurrency) {
    const feeAddr = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: input.ledgerCurrency })
    if (feeAddr && input.sweepAmt >= EASNER_REVENUE_FEE_WALLET_SWEEP_MIN) {
      patch.fee_destination_address = feeAddr
    }
  }
  return patch
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
