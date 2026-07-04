import {
  computeCustomerDepositFee,
  computeEasnerMarginFromOmnibus,
} from "@easner/shared"
import { isDepositFeePricingEnabled } from "@/lib/deposit-omnibus/config"
import type { NoahBankPayInEnrichment } from "@/lib/noah/bank-onramp-tx"
import { classifyVerificationDepositFromFiatDeposit } from "@easner/shared/transactions/verification-deposit"

function breakdownAmount(tx: Record<string, unknown>, type: string): number | null {
  const items = tx.Breakdown
  if (!Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (String(row.Type ?? "") !== type) continue
    const n = Number.parseFloat(String(row.Amount ?? ""))
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Easner deposit fee fields for pay-in metadata when DEPOSIT_FEE_PRICING_ENABLED.
 */
export function enrichBankDepositPayInFeeFields(
  tx: Record<string, unknown>,
  enrichment: NoahBankPayInEnrichment,
): Record<string, unknown> {
  if (!isDepositFeePricingEnabled()) return {}

  const kind = classifyVerificationDepositFromFiatDeposit({
    payload: tx,
    fiatAmount: enrichment.fiatAmount,
    settledStablecoinAmount: enrichment.settledStablecoinAmount,
  })
  if (kind === "verification") return {}

  const noahChannelFee = breakdownAmount(tx, "ChannelFee")
  const omnibusRemaining = enrichment.settledStablecoinAmount
  const customerFee = computeCustomerDepositFee(enrichment.fiatAmount, enrichment.fiatCurrency)
  const userNet = Math.round((enrichment.fiatAmount - customerFee) * 100) / 100

  const marginFields =
    omnibusRemaining != null && Number.isFinite(omnibusRemaining)
      ? computeEasnerMarginFromOmnibus({
          fiatAmount: enrichment.fiatAmount,
          currency: enrichment.fiatCurrency,
          noahChannelFee,
          omnibusRemaining,
        })
      : null

  return {
    customer_fee: customerFee,
    easner_deposit_fee: customerFee,
    user_net_amount: userNet,
    fee_amount: customerFee,
    posted_amount: userNet,
    noah_channel_fee: noahChannelFee,
    noah_inbound_fee: noahChannelFee,
    easner_margin: marginFields?.easnerMargin ?? null,
    deposit_split_status: "pending",
  }
}
