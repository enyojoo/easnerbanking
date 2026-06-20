/**
 * Noah /prices — USDC send sizes × African local corridors vs PDF schedule.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-noah-africa-usdc-sizes.ts
 */

import { getNoahUsdCryptoTicker } from "../lib/noah/config"
import { noahFetch } from "../lib/noah/http"
import { computeNoahOfframpScheduleFee } from "../lib/noah/noah-offramp-fee-schedule"

const SEND_SIZES = [50, 100, 500, 1000, 2000, 5000]

const CORRIDORS = [
  { country: "NG", fiat: "NGN" },
  { country: "KE", fiat: "KES" },
  { country: "GH", fiat: "GHS" },
  { country: "ZA", fiat: "ZAR" },
  { country: "RW", fiat: "RWF" },
] as const

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

function pickChannel(row: Record<string, unknown>): number | null {
  const bd = row?.CryptoFeeBreakdown
  if (!Array.isArray(bd)) return null
  for (const x of bd) {
    if (!x || typeof x !== "object") continue
    const item = x as Record<string, unknown>
    if (item.Type === "Channel") {
      const n = Number(item.Amount)
      return Number.isFinite(n) ? n : null
    }
  }
  return null
}

async function probeSend(country: string, fiat: string, sourceAmount: number) {
  const usdc = getNoahUsdCryptoTicker()
  const raw = await noahFetch<Record<string, unknown>>({
    method: "GET",
    path: "/prices",
    query: {
      SourceCurrency: usdc,
      DestinationCurrency: fiat,
      Country: country,
      SourceAmount: String(sourceAmount),
    },
  })
  const row = (Array.isArray(raw.Items) ? raw.Items[0] : raw) as Record<string, unknown>
  const src = Number(row?.SourceAmount ?? sourceAmount)
  const dest = Number(row?.DestinationAmount)
  const rate = Number(row?.Rate)
  const channel = pickChannel(row)
  const schedule = computeNoahOfframpScheduleFee({
    currency: fiat,
    countryCode: country,
    paymentMethodKey: "bank",
    basisAmount: src,
  })
  const mid = rate > 0 && Number.isFinite(dest) ? dest / rate : null
  const channelPctOfSend = channel != null && src > 0 ? round6((channel / src) * 100) : null

  return {
    corridor: `${country} ${fiat}`,
    sendUsdc: src,
    recipientGets: dest,
    rate: round6(rate),
    channelFeeUsd: channel,
    expectedScheduleUsd: schedule,
    vsScheduleUsd:
      channel != null && schedule != null ? round6(channel - schedule) : null,
    channelPctOfSend,
    midNotionalUsd: mid != null ? round6(mid) : null,
    totalFeeLocal: row?.TotalFee ?? null,
    paymentMethodCategory: row?.PaymentMethodCategory ?? null,
  }
}

async function main() {
  const results: Array<Record<string, unknown>> = []

  for (const { country, fiat } of CORRIDORS) {
    for (const size of SEND_SIZES) {
      try {
        results.push(await probeSend(country, fiat, size))
      } catch (e) {
        results.push({
          corridor: `${country} ${fiat}`,
          sendUsdc: size,
          error: e instanceof Error ? e.message.slice(0, 160) : String(e),
        })
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        probedAt: new Date().toISOString(),
        schedule: "Africa PDF: NGN $0.50+0.50%, ZAR $1+0.55%, KES/GHS/RWF $1.25–1.50+0.55%",
        sendSizes: SEND_SIZES,
        corridors: CORRIDORS.map((c) => `${c.country} ${c.fiat}`),
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
