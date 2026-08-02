import { computeYcExactLocalPayoutCost } from "@easner/shared"
import { fetchYcAvailableBalance } from "./account-balance"
import { getYellowcardUsdcTopupAddressSolana } from "./config"
import { fetchYcSendServiceFeeConfig } from "./send-fee-config"

/**
 * Exact-local payouts settle from the YC USD balance instead of a per-send crypto deposit.
 * That is the only YC shape that credits the recipient an exact local amount: direct settlement
 * infers the amount from settlement crypto rounded to USD cents, quantising the credit to
 * ~rate/100 of local currency.
 *
 * Funding model: lock with `forceAccept: false`, sweep the user's USDC to the Treasury Portal
 * top-up address, then `POST /send/{id}/accept`. YC then pays the recipient automatically from
 * its USD balance (no manual dashboard payout). If the float was short at accept time, YC parks
 * the send in PENDING_LIQUIDITY until the top-up credits. Callers must still be able to fall
 * back to direct settlement when the lock cannot honour the exact amount.
 */
export function isYcExactLocalPayoutEnabled(): boolean {
  const value = String(process.env.YC_EXACT_LOCAL_PAYOUT || "").trim().toLowerCase()
  return value === "true" || value === "1"
}

/**
 * Optional seed float preferred above a send's cost. Default 0: the user's own USDC sweep
 * funds the payout before/around accept (PENDING_LIQUIDITY covers the credit lag).
 * Set YC_EXACT_LOCAL_FLOAT_BUFFER_USD>0 only if you want to require a pre-funded cushion.
 */
export function getYcExactLocalFloatBufferUsd(): number {
  const raw = Number(process.env.YC_EXACT_LOCAL_FLOAT_BUFFER_USD ?? 0)
  return Number.isFinite(raw) && raw >= 0 ? raw : 0
}

export type YcExactLocalPayoutPlan = {
  eligible: boolean
  reason?: string
  /** USD debited from the YC balance (recipient credit + service fee). */
  costUsd: number
  feeLocal: number
  grossLocal: number
  availableUsd: number
  /** Where the user's USDC is swept to replenish the float. */
  topupAddress: string
}

/**
 * Decide whether this payout can settle exactly, and at what cost.
 * Never throws — an unusable balance or missing address falls back to direct settlement.
 */
export async function planYcExactLocalPayout(input: {
  receiveAmount: number
  ycSellRate?: number | null
  country: string
  currency: string
  channelType: "bank" | "momo"
}): Promise<YcExactLocalPayoutPlan> {
  const empty = {
    costUsd: 0,
    feeLocal: 0,
    grossLocal: 0,
    availableUsd: 0,
    topupAddress: getYellowcardUsdcTopupAddressSolana(),
  }

  if (!isYcExactLocalPayoutEnabled()) {
    return { eligible: false, reason: "exact_local_disabled", ...empty }
  }
  if (!empty.topupAddress) {
    return { eligible: false, reason: "missing_topup_address", ...empty }
  }
  const rate = Number(input.ycSellRate ?? 0)
  if (!(rate > 0)) {
    return { eligible: false, reason: "missing_yc_sell_rate", ...empty }
  }
  // Balance settlement has its own fee schedule (NGN bank is flat 100 rather than 1%), so the
  // direct-settlement config would under-fund the float. Without it the cost is a guess.
  const feeConfig = await fetchYcSendServiceFeeConfig({
    country: input.country,
    currency: input.currency,
    channelType: input.channelType,
    directSettlement: false,
  })
  if (!feeConfig) {
    return { eligible: false, reason: "missing_fee_config", ...empty }
  }

  const cost = computeYcExactLocalPayoutCost({
    receiveAmount: input.receiveAmount,
    ycSellRate: rate,
    feeConfig,
  })
  // Balance is informational: execute sweeps the user's USDC to the top-up address, then accepts.
  // A positive buffer only blocks when ops require a pre-funded cushion.
  const availableUsd = await fetchYcAvailableBalance("USD")
  const buffer = getYcExactLocalFloatBufferUsd()
  const required = buffer > 0 ? cost.costUsd + buffer : 0
  const eligible = buffer <= 0 || availableUsd >= required

  return {
    eligible,
    reason: eligible ? undefined : "insufficient_yc_float",
    costUsd: cost.costUsd,
    feeLocal: cost.feeLocal,
    grossLocal: cost.grossLocal,
    availableUsd,
    topupAddress: empty.topupAddress,
  }
}

/**
 * YC must credit the recipient exactly what we quoted.
 * Anything else means the local amount was not honoured, and the send must not be used.
 *
 * Also guards the case the docs leave open: whether the service fee is charged on top of
 * `localAmount` or taken out of the recipient's credit. If the response says we are debited only
 * the recipient's amount while a fee exists, the recipient would be short by that fee, so the
 * send is rejected rather than trusted.
 */
export function assertYcExactLocalCredit(input: {
  quotedReceive: number
  sendRes: Record<string, unknown>
  receiveCurrency: string
}): number {
  const quoted = Math.round(Number(input.quotedReceive) * 100) / 100
  const credited = Math.round(
    Number(input.sendRes.convertedAmount ?? input.sendRes.localAmount ?? 0) * 100,
  ) / 100
  if (credited !== quoted) {
    throw new Error(
      `Yellowcard locked ${credited} ${input.receiveCurrency} for an exact ${quoted} ${input.receiveCurrency} payout.`,
    )
  }

  const feeLocal = Number(input.sendRes.serviceFeeAmountLocal ?? 0)
  const debitedUsd = Number(input.sendRes.amount ?? 0)
  const rate = Number(input.sendRes.rate ?? 0)
  if (feeLocal > 0 && debitedUsd > 0 && rate > 0) {
    const debitedLocal = debitedUsd * rate
    // Fee on top debits ~quoted + fee; fee inside the credit debits ~quoted. Test the midpoint.
    if (debitedLocal < quoted + feeLocal / 2) {
      throw new Error(
        `Yellowcard debits ${debitedLocal.toFixed(2)} ${input.receiveCurrency} for a ${quoted} ${input.receiveCurrency} credit plus ${feeLocal} fee — the fee would come out of the recipient's credit.`,
      )
    }
  }

  return credited
}
