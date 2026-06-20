/**
 * Compare Noah /prices ChannelFee vs merchant schedules:
 * - Africa local offramp PDF (NGN/KES/GHS/ZAR/RWF)
 * - Major currency ramps: USD $2 + 45bps, EUR €1 + 50bps
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-noah-schedule-compare.ts
 */

import { getNoahUsdCryptoTicker } from "../lib/noah/config"
import { noahFetch } from "../lib/noah/http"
import { computeNoahOfframpScheduleFee } from "../lib/noah/noah-offramp-fee-schedule"

type ProbeCase = {
  label: string
  country: string
  fiat: string
  mode: "source" | "dest"
  amount: number
}

const CASES: ProbeCase[] = [
  // Fixed send 100 USDC
  { label: "100 USDC → NGN", country: "NG", fiat: "NGN", mode: "source", amount: 100 },
  { label: "100 USDC → KES", country: "KE", fiat: "KES", mode: "source", amount: 100 },
  { label: "100 USDC → GHS", country: "GH", fiat: "GHS", mode: "source", amount: 100 },
  { label: "100 USDC → ZAR", country: "ZA", fiat: "ZAR", mode: "source", amount: 100 },
  { label: "100 USDC → RWF", country: "RW", fiat: "RWF", mode: "source", amount: 100 },
  { label: "100 USDC → USD", country: "US", fiat: "USD", mode: "source", amount: 100 },
  { label: "100 USDC → EUR", country: "DE", fiat: "EUR", mode: "source", amount: 100 },
  // Fixed receive (Africa)
  { label: "receive R100", country: "ZA", fiat: "ZAR", mode: "dest", amount: 100 },
  { label: "receive ₦10,000", country: "NG", fiat: "NGN", mode: "dest", amount: 10_000 },
  { label: "receive GH₵100", country: "GH", fiat: "GHS", mode: "dest", amount: 100 },
  { label: "receive KSh1,000", country: "KE", fiat: "KES", mode: "dest", amount: 1000 },
  { label: "receive RWF20,000", country: "RW", fiat: "RWF", mode: "dest", amount: 20_000 },
  // Large tickets
  { label: "receive ₦100,000", country: "NG", fiat: "NGN", mode: "dest", amount: 100_000 },
  { label: "receive $100", country: "US", fiat: "USD", mode: "dest", amount: 100 },
  { label: "receive $1,000", country: "US", fiat: "USD", mode: "dest", amount: 1000 },
  { label: "receive €100", country: "DE", fiat: "EUR", mode: "dest", amount: 100 },
  { label: "receive €1,000", country: "DE", fiat: "EUR", mode: "dest", amount: 1000 },
]

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

/** Major currency off-ramp: USD $2 + 45bps; EUR €1 + 50bps (basis = SourceAmount USDC). */
function computeMajorRampScheduleFee(fiat: string, basisAmountUsd: number): number | null {
  if (!Number.isFinite(basisAmountUsd) || basisAmountUsd <= 0) return null
  const c = fiat.toUpperCase()
  if (c === "USD") return round6(2 + 0.0045 * basisAmountUsd)
  if (c === "EUR") return round6(1 + 0.005 * basisAmountUsd)
  return null
}

function scheduleLabel(fiat: string): string {
  const c = fiat.toUpperCase()
  if (c === "USD") return "Major ramp: $2 + 45bps × floor"
  if (c === "EUR") return "Major ramp: €1 + 50bps × floor"
  return "Africa PDF: fixed USD + variable % × floor"
}

function expectedScheduleFee(fiat: string, country: string, basisAmountUsd: number): number | null {
  const major = computeMajorRampScheduleFee(fiat, basisAmountUsd)
  if (major != null) return major
  return computeNoahOfframpScheduleFee({
    currency: fiat,
    countryCode: country,
    paymentMethodKey: "bank",
    basisAmount: basisAmountUsd,
  })
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

async function probeCase(c: ProbeCase) {
  const usdc = getNoahUsdCryptoTicker()
  const query: Record<string, string> = {
    SourceCurrency: usdc,
    DestinationCurrency: c.fiat,
    Country: c.country,
  }
  if (c.mode === "source") query.SourceAmount = String(c.amount)
  else query.DestinationAmount = String(c.amount)

  const raw = await noahFetch<Record<string, unknown>>({ method: "GET", path: "/prices", query })
  const row = (Array.isArray(raw.Items) ? raw.Items[0] : raw) as Record<string, unknown>
  const src = Number(row?.SourceAmount)
  const dest = Number(row?.DestinationAmount)
  const rate = Number(row?.Rate)
  const channel = pickChannel(row)
  const schedule = expectedScheduleFee(c.fiat, c.country, src)
  const mid = Number.isFinite(dest) && rate > 0 ? dest / rate : null

  return {
    label: c.label,
    corridor: `${c.country} ${c.fiat}`,
    scheduleType: scheduleLabel(c.fiat),
    recipientGets: c.mode === "dest" ? c.amount : dest,
    youSendUsd: src,
    rate,
    paymentMethodCategory: row?.PaymentMethodCategory ?? null,
    channelFeeUsd: channel,
    totalFeeLocal: row?.TotalFee ?? null,
    midNotionalUsd: mid,
    expectedScheduleUsd: schedule,
    vsScheduleUsd:
      channel != null && schedule != null ? round6(channel - schedule) : null,
    aligned:
      channel != null && schedule != null
        ? Math.abs(channel - schedule) <= 0.05
        : null,
  }
}

async function main() {
  const results = []
  for (const c of CASES) {
    try {
      results.push(await probeCase(c))
    } catch (e) {
      results.push({
        label: c.label,
        corridor: `${c.country} ${c.fiat}`,
        error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      })
    }
  }

  const aligned = results.filter((r) => r.aligned === true)
  const misaligned = results.filter((r) => r.aligned === false)

  console.log(
    JSON.stringify(
      {
        probedAt: new Date().toISOString(),
        schedules: {
          africa:
            "NGN $0.50+0.50%, ZAR $1+0.55%, KES $1.25+0.55%, GHS $1.50+0.55%, RWF placeholder $1.25+0.55%",
          major: "USD $2+45bps, EUR €1+50bps (basis=SourceAmount/noah floor)",
        },
        summary: {
          total: results.length,
          alignedWithin5c: aligned.length,
          misalignedOver5c: misaligned.length,
        },
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
