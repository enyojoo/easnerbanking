function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

export type ComputeEasnerRevenueFeeWalletSweepInput = {
  marginAmount?: number
  processingFee?: number
  /** Optional on-chain / ledger surplus (e.g. totalDebited − providerOut, omnibusIn − credit). */
  ledgerSurplus?: number
  /** @deprecated Use ledgerSurplus. YC balance payout: totalDebited − cryptoAuthorizedAmount. */
  totalDebited?: number
  /** @deprecated Use ledgerSurplus with totalDebited − cryptoAuthorizedAmount. */
  cryptoAuthorizedAmount?: number
}

/** Easner FX margin + 1% processing fee to sweep to the fee wallet. */
export function computeEasnerRevenueFeeWalletSweepAmount(
  input: ComputeEasnerRevenueFeeWalletSweepInput,
): number {
  const marginAmount = roundUsdc(Number(input.marginAmount ?? 0))
  const processingFee = roundUsdc(Number(input.processingFee ?? 0))
  const quotedSurplus = roundUsdc(marginAmount + processingFee)

  let ledgerSurplus = Number(input.ledgerSurplus ?? NaN)
  if (!Number.isFinite(ledgerSurplus)) {
    const totalDebited = Number(input.totalDebited ?? 0)
    const cryptoAmount = Number(input.cryptoAuthorizedAmount ?? 0)
    ledgerSurplus =
      Number.isFinite(totalDebited) &&
      totalDebited > 0 &&
      Number.isFinite(cryptoAmount) &&
      cryptoAmount > 0
        ? roundUsdc(Math.max(0, totalDebited - cryptoAmount))
        : 0
  } else {
    ledgerSurplus = roundUsdc(Math.max(0, ledgerSurplus))
  }

  return Math.max(quotedSurplus, ledgerSurplus)
}

/** @deprecated Prefer computeEasnerRevenueFeeWalletSweepAmount */
export function computeYcBalancePayoutFeeWalletSweepAmount(input: {
  marginAmount?: number
  processingFee?: number
  totalDebited?: number
  cryptoAuthorizedAmount?: number
}): number {
  return computeEasnerRevenueFeeWalletSweepAmount(input)
}

export const EASNER_REVENUE_FEE_WALLET_SWEEP_MIN = 0.01
