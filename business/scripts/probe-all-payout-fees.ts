import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { getNoahEurCryptoTicker, getNoahUsdCryptoTicker } from "../lib/noah/config"
import { noahFetch, NoahHttpError } from "../lib/noah/http"
import {
  computeNoahOfframpScheduleFee,
  resolveNoahOfframpPaymentMethodKey,
} from "../lib/noah/noah-offramp-fee-schedule"

const SEND_PROBE = 100
const AFRICA_COUNTRY_CODES = new Set(["NG", "KE", "GH", "RW", "ZA"])

const RECEIVE_PROBE_BY_FIAT: Record<string, number> = {
  NGN: 10_000,
  KES: 10_000,
  GHS: 1_000,
  ZAR: 1_000,
  RWF: 10_000,
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function errMsg(e: unknown): string {
  if (e instanceof NoahHttpError) return `${e.status}: ${e.message.slice(0, 120)}`
  return e instanceof Error ? e.message.slice(0, 120) : String(e)
}

function pickChannel(row: Record<string, unknown>): number | null {
  const bd = row?.CryptoFeeBreakdown
  if (!Array.isArray(bd)) return null
  for (const x of bd) {
    if (x && typeof x === "object" && (x as Record<string, unknown>).Type === "Channel") {
      const n = Number((x as Record<string, unknown>).Amount)
      return Number.isFinite(n) ? n : null
    }
  }
  return null
}

type ProbeResult = {
  sourceCrypto: string
  sourceCurrency: "USD" | "EUR"
  country: string
  destinationFiat: string
  region: "africa" | "other"
  probeMode: "send" | "receive"
  probeAmount: number
  ok: boolean
  error?: string
  rate?: number
  sourceAmountUsd?: number
  destinationAmount?: number
  paymentMethodCategory?: string | null
  channelFeeUsd?: number | null
  scheduleFeeUsd?: number | null
  channelPctOfSource?: number | null
  deltaChannelVsSchedule?: number | null
  scheduleMatch: "match" | "above" | "below" | "no_schedule" | "n/a"
}

async function probePrices(input: {
  sourceCrypto: string
  sourceCurrency: "USD" | "EUR"
  country: string
  destinationFiat: string
  probeMode: "send" | "receive"
  probeAmount: number
}): Promise<ProbeResult> {
  const region = AFRICA_COUNTRY_CODES.has(input.country) ? "africa" : "other"
  const base: ProbeResult = {
    sourceCrypto: input.sourceCrypto,
    sourceCurrency: input.sourceCurrency,
    country: input.country,
    destinationFiat: input.destinationFiat,
    region,
    probeMode: input.probeMode,
    probeAmount: input.probeAmount,
    ok: false,
    scheduleMatch: "n/a",
  }

  try {
    const query: Record<string, string> = {
      SourceCurrency: input.sourceCrypto,
      DestinationCurrency: input.destinationFiat,
      Country: input.country,
    }
    if (input.probeMode === "send") {
      query.SourceAmount = String(input.probeAmount)
    } else {
      query.DestinationAmount = String(input.probeAmount)
    }

    const raw = await noahFetch<Record<string, unknown>>({ method: "GET", path: "/prices", query })
    const row = (Array.isArray(raw.Items) ? raw.Items[0] : raw) as Record<string, unknown>
    const channel = pickChannel(row)
    const src = round6(Number(row.SourceAmount ?? (input.probeMode === "send" ? input.probeAmount : 0)))
    const dest = round6(Number(row.DestinationAmount ?? 0))
    const rate = Number(row.Rate)
    const pmc = row.PaymentMethodCategory != null ? String(row.PaymentMethodCategory) : null

    const schedule = computeNoahOfframpScheduleFee({
      currency: input.destinationFiat,
      countryCode: input.country,
      paymentMethodKey: resolveNoahOfframpPaymentMethodKey({
        paymentMethodCategory: pmc,
      }),
      basisAmount: src,
      basis: "noah_floor",
    })

    let scheduleMatch: ProbeResult["scheduleMatch"] = "no_schedule"
    let delta: number | null = null
    if (schedule != null && channel != null) {
      delta = round6(channel - schedule)
      if (Math.abs(delta) <= 0.05) scheduleMatch = "match"
      else if (delta > 0.05) scheduleMatch = "above"
      else scheduleMatch = "below"
    } else if (schedule == null) {
      scheduleMatch = "no_schedule"
    }

    return {
      ...base,
      ok: true,
      rate: Number.isFinite(rate) ? round2(rate) : undefined,
      sourceAmountUsd: src,
      destinationAmount: dest,
      paymentMethodCategory: pmc,
      channelFeeUsd: channel,
      scheduleFeeUsd: schedule,
      channelPctOfSource: channel != null && src > 0 ? round2((channel / src) * 100) : null,
      deltaChannelVsSchedule: delta,
      scheduleMatch,
    }
  } catch (e) {
    return { ...base, error: errMsg(e), scheduleMatch: "n/a" }
  }
}

async function main() {
  const usdc = getNoahUsdCryptoTicker()
  const eurc = getNoahEurCryptoTicker()

  const countriesMap = await noahFetch<Record<string, string[]>>({
    method: "GET",
    path: "/channels/sell/countries",
  })

  const pairs: Array<{ country: string; fiat: string }> = []
  for (const [country, fiats] of Object.entries(countriesMap)) {
    if (!Array.isArray(fiats)) continue
    for (const fiat of [...new Set(fiats.map((f) => f.toUpperCase()))]) {
      pairs.push({ country: country.toUpperCase(), fiat })
    }
  }
  pairs.sort((a, b) => a.fiat.localeCompare(b.fiat) || a.country.localeCompare(b.country))

  const results: ProbeResult[] = []

  for (const { country, fiat } of pairs) {
    // Skip same-currency noise where not a payout target
    if (fiat === "USD" && country === "US") continue

    const destFiat = fiat
    for (const [sourceCrypto, sourceCurrency] of [
      [usdc, "USD"],
      [eurc, "EUR"],
    ] as const) {
      // EUR balance only supports non-USD/EUR local offramps typically; still probe all Noah lists
      if (sourceCurrency === "EUR" && (fiat === "EUR" || fiat === "USD")) continue

      results.push(
        await probePrices({
          sourceCrypto,
          sourceCurrency,
          country,
          destinationFiat: destFiat,
          probeMode: "send",
          probeAmount: SEND_PROBE,
        }),
      )

      const receiveProbe = RECEIVE_PROBE_BY_FIAT[fiat]
      if (receiveProbe != null && AFRICA_COUNTRY_CODES.has(country)) {
        results.push(
          await probePrices({
            sourceCrypto,
            sourceCurrency,
            country,
            destinationFiat: destFiat,
            probeMode: "receive",
            probeAmount: receiveProbe,
          }),
        )
      }
    }
  }

  const ok = results.filter((r) => r.ok)
  const africa = ok.filter((r) => r.region === "africa")
  const other = ok.filter((r) => r.region === "other")

  const summary = {
    probedAt: new Date().toISOString(),
    sendProbeUSDC: SEND_PROBE,
    totals: {
      attempted: results.length,
      ok: ok.length,
      failed: results.length - ok.length,
      africaOk: africa.length,
      otherOk: other.length,
    },
    africaScheduleSend100: africa
      .filter((r) => r.probeMode === "send" && r.sourceCurrency === "USD")
      .map((r) => ({
        corridor: `${r.country} ${r.destinationFiat}`,
        channel: r.channelFeeUsd,
        schedule: r.scheduleFeeUsd,
        delta: r.deltaChannelVsSchedule,
        match: r.scheduleMatch,
        pctOfSend: r.channelPctOfSource,
      })),
    africaReceiveProbes: africa
      .filter((r) => r.probeMode === "receive")
      .map((r) => ({
        corridor: `${r.sourceCurrency}→${r.country} ${r.destinationFiat}`,
        receive: r.probeAmount,
        sourceUsd: r.sourceAmountUsd,
        channel: r.channelFeeUsd,
        schedule: r.scheduleFeeUsd,
        delta: r.deltaChannelVsSchedule,
        match: r.scheduleMatch,
      })),
    eurSourceAfrica: africa
      .filter((r) => r.sourceCurrency === "EUR" && r.probeMode === "send")
      .map((r) => ({
        corridor: `${r.country} ${r.destinationFiat}`,
        channel: r.channelFeeUsd,
        schedule: r.scheduleFeeUsd,
        match: r.scheduleMatch,
      })),
    nonAfricaUsdSend100: other
      .filter((r) => r.sourceCurrency === "USD" && r.probeMode === "send")
      .map((r) => ({
        corridor: `${r.country} ${r.destinationFiat}`,
        channel: r.channelFeeUsd,
        pctOfSend: r.channelPctOfSource,
        category: r.paymentMethodCategory,
      })),
    eurSourceNonAfrica: other
      .filter((r) => r.sourceCurrency === "EUR" && r.probeMode === "send")
      .map((r) => ({
        corridor: `${r.country} ${r.destinationFiat}`,
        channel: r.channelFeeUsd,
        pctOfSend: r.channelPctOfSource,
      })),
    failures: results.filter((r) => !r.ok).map((r) => ({
      corridor: `${r.sourceCurrency}→${r.country} ${r.destinationFiat} (${r.probeMode} ${r.probeAmount})`,
      error: r.error,
    })),
  }

  const outPath = join(process.cwd(), "data", "noah-payout-fee-probe-latest.json")
  mkdirSync(join(process.cwd(), "data"), { recursive: true })
  writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  console.error(`\nWrote full results → ${outPath}`)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
