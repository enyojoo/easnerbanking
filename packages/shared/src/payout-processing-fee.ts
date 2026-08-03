/**
 * Payout processing fee model (single displayed row).
 *
 * Two internal legs, ONE visible "Processing fee" row:
 *  - Easner bps leg (default 1%, uncapped) — our service fee, collected to the fee wallet
 *  - Provider channel / route cost (Noah `channel_cost` / LI.FI `routeCost`) — kept in `exchange_fee`
 *
 * The customer sees `Processing fee = bps leg + channel cost` as a single row.
 * There is NO separate "Exchange fee" row. The FX rate spread (0.5%) lives in the
 * quoted customer rate (rate-sync) and is never surfaced here.
 */

/** Default Easner payout processing fee in basis points (100 = 1%). */
export const DEFAULT_PAYOUT_PROCESSING_FEE_BPS = 100

function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

export type PayoutProcessingFeeOpts = {
  /** Basis points for the Easner leg. Defaults to 100 (1%). */
  bps?: number
}

/**
 * Easner processing fee leg: `principal × bps/10000`, uncapped.
 * `principal` is the send-currency you-send amount (Noah/LI.FI) or receive amount (direct Turnkey).
 */
export function computePayoutProcessingFeeBps(
  principalAmount: number,
  opts?: PayoutProcessingFeeOpts,
): number {
  const principal = roundMoney(principalAmount)
  if (!Number.isFinite(principal) || principal <= 0) return 0
  const bps = opts?.bps ?? DEFAULT_PAYOUT_PROCESSING_FEE_BPS
  if (!Number.isFinite(bps) || bps <= 0) return 0
  return roundMoney(principal * (bps / 10_000))
}

export function parsePayoutProcessingFeeBpsFromEnv(raw: string | undefined): number {
  const parsed = Number.parseInt(String(raw ?? "").trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_PAYOUT_PROCESSING_FEE_BPS
  return parsed
}

export type DisplayProcessingFeeInput = {
  /** Easner bps leg — `payout_review.processing_fee`. */
  processingFee?: number | null
  /** Provider channel / route cost — `payout_review.exchange_fee`. */
  exchangeFee?: number | null
}

/**
 * The single displayed "Processing fee" value = Easner bps leg + provider channel cost.
 * Both legs are in the send currency, so they sum directly.
 */
export function computeDisplayProcessingFee(input: DisplayProcessingFeeInput): number {
  const bpsLeg = Number(input.processingFee)
  const channel = Number(input.exchangeFee)
  const total =
    (Number.isFinite(bpsLeg) ? bpsLeg : 0) + (Number.isFinite(channel) ? channel : 0)
  return roundMoney(Math.max(0, total))
}

export type FootedDisplayProcessingFeeInput = {
  /** Precise principal shown in the Sending amount / Sent amount row. */
  sendingAmount: number
  /** Precise all-in debit shown in the Total debited row. */
  totalDebited: number
  /** Precise combined fee, used when the two amount inputs are unavailable. */
  fallbackFee?: number | null
}

/**
 * Fee amount whose two-decimal display exactly foots the other displayed rows.
 *
 * Example: 1.472563 + 0.024526 = 1.497089 precisely, but the independent displays
 * $1.47 + $0.02 do not equal $1.50. The customer-facing fee must therefore be $0.03.
 * Authoritative ledger/quote values remain unchanged.
 */
export function computeFootedDisplayProcessingFee(
  input: FootedDisplayProcessingFeeInput,
): number {
  if (Number.isFinite(input.sendingAmount) && Number.isFinite(input.totalDebited)) {
    const sendingMinor = Math.round(input.sendingAmount * 100)
    const totalMinor = Math.round(input.totalDebited * 100)
    if (sendingMinor >= 0 && totalMinor >= sendingMinor) {
      return (totalMinor - sendingMinor) / 100
    }
  }
  const fallback = Number(input.fallbackFee)
  return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback * 100) / 100 : 0
}
