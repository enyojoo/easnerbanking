/**
 * Noah GET /prices – 100 USDC source amount across all sell corridors.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-noah-100usdc-fees.ts
 */

import { getNoahUsdCryptoTicker } from "../lib/noah/config"
import { noahFetch } from "../lib/noah/http"
import { computeNoahOfframpScheduleFee } from "../lib/noah/noah-offramp-fee-schedule"

const SOURCE_AMOUNT = "100"

function pickFee(row: Record<string, unknown>) {
  const bd = row?.CryptoFeeBreakdown
  if (!Array.isArray(bd)) {
    return { channel: null as number | null, business: null as number | null, total: row?.TotalFee ?? null }
  }
  let channel: number | null = null
  let business: number | null = null
  for (const x of bd) {
    if (!x || typeof x !== "object") continue
    const item = x as Record<string, unknown>
    if (item.Type === "Channel") channel = Number(item.Amount)
    if (item.Type === "Business") business = Number(item.Amount)
  }
  return { channel, business, total: row?.TotalFee ?? null }
}

async function probePrice(country: string, fiat: string) {
  const usdc = getNoahUsdCryptoTicker()
  const dest = fiat
  const raw = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: "/prices",
    query: {
      SourceCurrency: usdc,
      DestinationCurrency: dest,
      Country: country,
      SourceAmount: SOURCE_AMOUNT,
    },
  })
  const row = (Array.isArray(raw.Items) ? raw.Items[0] : raw) as Record<string, unknown>
  const destAmt = Number(row?.DestinationAmount)
  const srcAmt = Number(row?.SourceAmount ?? SOURCE_AMOUNT)
  const rate = Number(row?.Rate)
  const fees = pickFee(row)
  const schedule = computeNoahOfframpScheduleFee({
    currency: fiat,
    countryCode: country,
    paymentMethodKey: "bank",
    basisAmount: srcAmt,
  })
  const midNotional =
    Number.isFinite(destAmt) && Number.isFinite(rate) && rate > 0 ? destAmt / rate : null
  const residualChannel = midNotional != null ? srcAmt - midNotional : null

  return {
    country,
    destFiat: fiat,
    sourceCrypto: usdc,
    sourceAmountUsd: srcAmt,
    destinationAmount: destAmt,
    rate,
    paymentMethodCategory: row?.PaymentMethodCategory ?? null,
    channelFeeUsd: fees.channel,
    businessFeeUsd: fees.business,
    totalFeeDest: fees.total,
    midNotionalUsd: midNotional,
    residualChannelUsd: residualChannel,
    merchantScheduleUsd: schedule,
    deltaChannelVsSchedule:
      fees.channel != null && schedule != null
        ? Math.round((fees.channel - schedule) * 1_000_000) / 1_000_000
        : null,
  }
}

async function probeDestAmount(country: string, fiat: string, destAmount: number) {
  const usdc = getNoahUsdCryptoTicker()
  const raw = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: "/prices",
    query: {
      SourceCurrency: usdc,
      DestinationCurrency: fiat,
      Country: country,
      DestinationAmount: String(destAmount),
    },
  })
  const row = (Array.isArray(raw.Items) ? raw.Items[0] : raw) as Record<string, unknown>
  const fees = pickFee(row)
  const srcAmt = Number(row?.SourceAmount)
  const rate = Number(row?.Rate)
  const schedule = computeNoahOfframpScheduleFee({
    currency: fiat,
    countryCode: country,
    paymentMethodKey: "bank",
    basisAmount: srcAmt,
  })
  const midNotional =
    Number.isFinite(destAmount) && Number.isFinite(rate) && rate > 0 ? destAmount / rate : null
  return {
    country,
    destFiat: fiat,
    destinationAmount: destAmount,
    sourceAmountUsd: srcAmt,
    rate,
    paymentMethodCategory: row?.PaymentMethodCategory ?? null,
    channelFeeUsd: fees.channel,
    totalFeeDest: fees.total,
    midNotionalUsd: midNotional,
    merchantScheduleUsd: schedule,
    deltaChannelVsSchedule:
      fees.channel != null && schedule != null
        ? Math.round((fees.channel - schedule) * 1_000_000) / 1_000_000
        : null,
  }
}

async function main() {
  const mode = process.argv.includes("--dest") ? "dest" : "source"
  const usdc = getNoahUsdCryptoTicker()

  if (mode === "dest") {
    const tickets: Array<[string, string, number]> = [
      ["NGN", "NG", 1000],
      ["NGN", "NG", 100_000],
      ["NGN", "NG", 500_000],
      ["KES", "KE", 5000],
      ["KES", "KE", 100_000],
      ["GHS", "GH", 100],
      ["GHS", "GH", 1000],
      ["GHS", "GH", 50_000],
      ["ZAR", "ZA", 100],
      ["ZAR", "ZA", 1000],
      ["ZAR", "ZA", 50_000],
      ["USD", "US", 100],
      ["USD", "US", 1000],
      ["EUR", "DE", 100],
      ["EUR", "DE", 1000],
    ]
    const results = []
    for (const [fiat, country, amt] of tickets) {
      try {
        results.push(await probeDestAmount(country, fiat, amt))
      } catch (e) {
        results.push({
          country,
          destFiat: fiat,
          destinationAmount: amt,
          error: e instanceof Error ? e.message.slice(0, 160) : String(e),
        })
      }
    }
    console.log(JSON.stringify({ probedAt: new Date().toISOString(), mode, results }, null, 2))
    return
  }

  const countriesMap = await noahFetch<Record<string, string[]>>({
    method: "GET",
    path: "/channels/sell/countries",
  })

  const corridors: Array<{ country: string; fiat: string }> = []
  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    for (const f of [...new Set(fiats.map((x) => String(x).toUpperCase()))]) {
      corridors.push({ country, fiat: f })
    }
  }
  corridors.sort((a, b) => a.country.localeCompare(b.country) || a.fiat.localeCompare(b.fiat))

  const results: Array<Record<string, unknown>> = []
  for (const { country, fiat } of corridors) {
    try {
      results.push(await probePrice(country, fiat))
    } catch (e) {
      results.push({
        country,
        destFiat: fiat,
        error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        probedAt: new Date().toISOString(),
        mode: "source",
        sourceAmount: Number(SOURCE_AMOUNT),
        sourceCrypto: usdc,
        corridorCount: corridors.length,
        results,
      },
      null,
      2,
    ),
  )
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
