/**
 * Bank deposit (VA on-ramp) customer fee – Easner UX + ledger only.
 * Noah API does not support min/max caps; inbound ChannelFee is deducted by Noah before Remaining.
 */

export const DEFAULT_DEPOSIT_FEE_BPS = 100

export type DepositFeeCurrency = "USD" | "EUR" | "GBP" | string

function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function depositFeeBounds(currency: DepositFeeCurrency): { min: number; max: number } {
  const c = String(currency || "USD").trim().toUpperCase()
  if (c === "EUR") return { min: 3, max: 10 }
  if (c === "GBP") return { min: 3, max: 10 }
  return { min: 3, max: 10 }
}

export type CustomerDepositFeeOpts = {
  bps?: number
}

/**
 * Customer-facing deposit processing fee: 1% with currency min/max (default $3 / $10).
 */
export function computeCustomerDepositFee(
  fiatAmount: number,
  currency: DepositFeeCurrency,
  opts?: CustomerDepositFeeOpts,
): number {
  const fiat = roundMoney(fiatAmount)
  if (!Number.isFinite(fiat) || fiat <= 0) return 0
  const bps = opts?.bps ?? DEFAULT_DEPOSIT_FEE_BPS
  if (!Number.isFinite(bps) || bps <= 0) return 0
  const raw = roundMoney(fiat * (bps / 10_000))
  const { min, max } = depositFeeBounds(currency)
  return roundMoney(Math.min(max, Math.max(min, raw)))
}

export type EasnerMarginFromOmnibusInput = {
  fiatAmount: number
  currency: DepositFeeCurrency
  noahChannelFee: number | null
  omnibusRemaining: number
  bps?: number
}

export type EasnerMarginFromOmnibusResult = {
  customerFee: number
  userNet: number
  easnerMargin: number
  noahChannelFee: number
}

/**
 * Split omnibus receipt after Noah Option 1 (ChannelFee already taken).
 * userNet = fiat − customerFee; easnerMargin = omnibusRemaining − userNet.
 */
export function computeEasnerMarginFromOmnibus(
  input: EasnerMarginFromOmnibusInput,
): EasnerMarginFromOmnibusResult {
  const fiat = roundMoney(input.fiatAmount)
  const omnibusRemaining = roundMoney(input.omnibusRemaining)
  const channel =
    input.noahChannelFee != null && Number.isFinite(input.noahChannelFee)
      ? roundMoney(Math.max(0, input.noahChannelFee))
      : 0
  const customerFee = computeCustomerDepositFee(fiat, input.currency, { bps: input.bps })
  const userNet = roundMoney(Math.max(0, fiat - customerFee))
  const easnerMargin = roundMoney(omnibusRemaining - userNet)
  return { customerFee, userNet, easnerMargin, noahChannelFee: channel }
}

export function isDepositSplitEconomicsValid(margin: EasnerMarginFromOmnibusResult): boolean {
  return margin.easnerMargin >= 0 && margin.userNet > 0
}
