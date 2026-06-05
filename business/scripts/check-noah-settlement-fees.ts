/**
 * Compare settled Noah OUT tx Breakdown vs merchant NGN schedule ($0.50 + 0.5%).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/check-noah-settlement-fees.ts [txId...]
 */

import { noahFetch } from "../lib/noah/http"
import { computeNoahOfframpScheduleFee } from "../lib/noah/noah-offramp-fee-schedule"

const DEFAULT_IDS = [
  "9bf22c53-091e-5b35-85cd-d0e126036bf5",
  "e2fd8401-0625-56ba-a7c3-88975eafecf1",
  "1b06600d-f597-51c3-8f42-06cbec87dc5d",
]

function pickBreakdown(tx: Record<string, unknown>, type: string): number | null {
  const items = tx.Breakdown
  if (!Array.isArray(items)) return null
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (String(row.Type ?? "") !== type) continue
    const n = Number.parseFloat(String(row.Amount ?? ""))
    if (Number.isFinite(n)) return Math.abs(n)
  }
  return null
}

async function inspect(id: string) {
  const tx = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: `/transactions/${id}`,
  })

  const fiat = (tx.FiatPayment ?? tx.fiatPayment ?? {}) as Record<string, unknown>
  const receive = Number.parseFloat(String(fiat.Amount ?? fiat.FiatAmount ?? ""))
  const currency = String(fiat.Currency ?? fiat.FiatCurrency ?? "").toUpperCase()
  const rate = Number.parseFloat(String(fiat.Rate ?? ""))

  const channelFee = pickBreakdown(tx, "ChannelFee")
  const remaining = pickBreakdown(tx, "Remaining")
  const businessFee = pickBreakdown(tx, "BusinessFee")

  const cryptoFromFields = Number.parseFloat(
    String(tx.CryptoAmount ?? tx.CryptoAuthorizedAmount ?? ""),
  )
  const impliedFloor =
    channelFee != null && remaining != null
      ? channelFee + remaining + (businessFee ?? 0)
      : Number.isFinite(cryptoFromFields)
        ? cryptoFromFields
        : null

  const scheduleFee =
    impliedFloor != null && currency
      ? computeNoahOfframpScheduleFee({
          currency,
          countryCode: currency === "NGN" ? "NG" : undefined,
          paymentMethodKey: "bank",
          basisAmount: impliedFloor,
        })
      : null

  const midNotional =
    Number.isFinite(receive) && receive > 0 && Number.isFinite(rate) && rate > 0
      ? receive / rate
      : remaining

  const residualChannel =
    impliedFloor != null && midNotional != null ? impliedFloor - midNotional : null

  let tightenedChannelCost: number | null = null
  if (
    impliedFloor != null &&
    remaining != null &&
    channelFee != null &&
    businessFee != null &&
    Number.isFinite(receive) &&
    receive > 0
  ) {
    const { computeGlobalPayoutPricing } = await import(
      "../../packages/shared/src/global-payout-pricing"
    )
    const pricing = computeGlobalPayoutPricing({
      receiveAmount: receive,
      customerRate: receive / (remaining + businessFee),
      noahMid: rate > 0 ? rate : receive / remaining,
      noahFloor: impliedFloor,
      prepareChannelFee: channelFee,
      prepareRemaining: remaining,
    })
    tightenedChannelCost = pricing.channelCost
  }

  return {
    id,
    status: tx.Status ?? tx.status,
    receive,
    currency,
    rate,
    channelFee,
    remaining,
    businessFee,
    impliedFloor,
    midNotional,
    residualChannel,
    merchantScheduleFee: scheduleFee,
    deltaChannelVsSchedule:
      channelFee != null && scheduleFee != null ? channelFee - scheduleFee : null,
    deltaChannelVsResidual:
      channelFee != null && residualChannel != null ? channelFee - residualChannel : null,
    tightenedChannelCost,
    deltaTightenedVsChannel:
      tightenedChannelCost != null && channelFee != null
        ? tightenedChannelCost - channelFee
        : null,
    breakdown: tx.Breakdown,
    fiatPayment: fiat,
  }
}

async function comparePrices(dest: string, country: string, amount: number) {
  const { getNoahUsdCryptoTicker } = await import("../lib/noah/config")
  const usdc = getNoahUsdCryptoTicker()
  const raw = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: "/prices",
    query: {
      SourceCurrency: usdc,
      DestinationCurrency: dest,
      Country: country,
      DestinationAmount: String(amount),
    },
  })
  const row = (Array.isArray(raw.Items) ? raw.Items[0] : raw) as Record<string, unknown>
  const rate = Number(row?.Rate)
  const src = Number(row?.SourceAmount)
  const ch = Number(
    (row?.CryptoFeeBreakdown as Array<{ Type?: string; Amount?: string }> | undefined)?.find(
      (x) => x.Type === "Channel",
    )?.Amount,
  )
  const scheduleFee = computeNoahOfframpScheduleFee({
    currency: dest,
    countryCode: country,
    paymentMethodKey: "bank",
    basisAmount: src,
  })
  return {
    dest,
    amount,
    pricesSourceAmount: src,
    pricesChannel: ch,
    pricesResidual: src - amount / rate,
    merchantSchedule: scheduleFee,
    deltaPricesChannelVsSchedule: ch - (scheduleFee ?? 0),
  }
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const withPrices = process.argv.includes("--with-prices")
  const targets = ids.length > 0 ? ids : DEFAULT_IDS
  const results = []
  for (const id of targets) {
    try {
      results.push(await inspect(id))
    } catch (e) {
      results.push({ id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const pricesCompare = withPrices
    ? [
        await comparePrices("NGN", "NG", 1000),
        await comparePrices("GHS", "GH", 40),
        await comparePrices("ZAR", "ZA", 10),
        await comparePrices("NGN", "NG", 100_000),
      ]
    : undefined
  console.log(
    JSON.stringify({ checkedAt: new Date().toISOString(), results, pricesCompare }, null, 2),
  )
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
