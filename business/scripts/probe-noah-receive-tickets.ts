/**
 * Probe Noah /prices for fixed destination (receive) amounts.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-noah-receive-tickets.ts
 */

import { getNoahUsdCryptoTicker } from "../lib/noah/config"
import { noahFetch } from "../lib/noah/http"
import { computeNoahOfframpScheduleFee } from "../lib/noah/noah-offramp-fee-schedule"

const TICKETS: Array<{ country: string; fiat: string; amount: number; label: string }> = [
  { country: "ZA", fiat: "ZAR", amount: 100, label: "100 rand" },
  { country: "NG", fiat: "NGN", amount: 10_000, label: "10,000 ngn" },
  { country: "GH", fiat: "GHS", amount: 100, label: "100 ghs" },
  { country: "KE", fiat: "KES", amount: 1000, label: "1,000 kes" },
  { country: "RW", fiat: "RWF", amount: 20_000, label: "20,000 rwf" },
]

function pickFee(row: Record<string, unknown>) {
  const bd = row?.CryptoFeeBreakdown
  if (!Array.isArray(bd)) {
    return { channel: null as number | null, totalLocal: row?.TotalFee ?? null }
  }
  let channel: number | null = null
  for (const x of bd) {
    if (!x || typeof x !== "object") continue
    const item = x as Record<string, unknown>
    if (item.Type === "Channel") channel = Number(item.Amount)
  }
  return { channel, totalLocal: row?.TotalFee ?? null }
}

async function main() {
  const usdc = getNoahUsdCryptoTicker()
  const results = []

  for (const t of TICKETS) {
    try {
      const raw = await noahFetch<Record<string, unknown>>({
        method: "GET",
        path: "/prices",
        query: {
          SourceCurrency: usdc,
          DestinationCurrency: t.fiat,
          Country: t.country,
          DestinationAmount: String(t.amount),
        },
      })
      const row = (Array.isArray(raw.Items) ? raw.Items[0] : raw) as Record<string, unknown>
      const src = Number(row?.SourceAmount)
      const rate = Number(row?.Rate)
      const fees = pickFee(row)
      const midNotional = rate > 0 ? t.amount / rate : null
      const schedule = computeNoahOfframpScheduleFee({
        currency: t.fiat,
        countryCode: t.country,
        paymentMethodKey: "bank",
        basisAmount: src,
      })

      results.push({
        label: t.label,
        corridor: `${t.country} ${t.fiat}`,
        recipientGets: t.amount,
        youSendUsd: src,
        rate,
        paymentMethodCategory: row?.PaymentMethodCategory ?? null,
        channelFeeUsd: fees.channel,
        totalFeeLocal: fees.totalLocal,
        midNotionalUsd: midNotional,
        merchantScheduleUsd: schedule,
        vsScheduleUsd:
          fees.channel != null && schedule != null
            ? Math.round((fees.channel - schedule) * 1_000_000) / 1_000_000
            : null,
      })
    } catch (e) {
      results.push({
        label: t.label,
        corridor: `${t.country} ${t.fiat}`,
        error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      })
    }
  }

  console.log(JSON.stringify({ probedAt: new Date().toISOString(), sourceCrypto: usdc, results }, null, 2))
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
