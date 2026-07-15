/**
 * Fetch YC sandbox rates + sample fee hints for cross-border corridors.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-yc-cross-border-fees.ts
 */
import { yellowcardFetch } from "../lib/yellowcard/http"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"

type RateRow = {
  buy?: number
  sell?: number
  locale?: string
  code?: string
  updatedAt?: string
}

type Channel = {
  id?: string
  country?: string
  currency?: string
  channelType?: string
  rampType?: string
  status?: string
  apiStatus?: string
  feeLocal?: number
  feeUSD?: number
  min?: number
  max?: number
}

async function main() {
  console.log("YC environment:", getYellowcardEnvironment())

  const ratesResp = await yellowcardFetch<{ rates?: RateRow[] } | RateRow[]>({
    method: "GET",
    path: "/rates",
  })
  const rates = Array.isArray(ratesResp) ? ratesResp : (ratesResp.rates ?? [])

  const codes = ["NGN", "KES", "RWF", "GHS", "ZAR", "XOF", "TZS", "UGX", "ZMW"]
  console.log("\n=== YC /rates (local per USD, buy/sell) ===")
  for (const code of codes) {
    const r = rates.filter((x) => String(x.code).toUpperCase() === code)
    if (!r.length) {
      console.log(`${code}: (not in rates response)`)
      continue
    }
    for (const row of r) {
      console.log(
        `${row.code} locale=${row.locale} buy=${row.buy} sell=${row.sell} updated=${row.updatedAt}`,
      )
    }
  }

  const channelsResp = await yellowcardFetch<{ channels?: Channel[] } | Channel[]>({
    method: "GET",
    path: "/channels",
  })
  const channels = Array.isArray(channelsResp) ? channelsResp : (channelsResp.channels ?? [])
  const active = channels.filter((c) => c.apiStatus === "active" && c.status === "active")

  const corridors = [
    { from: "NG", fromCcy: "NGN", to: "KE", toCcy: "KES", label: "NGN → KES" },
    { from: "RW", fromCcy: "RWF", to: "NG", toCcy: "NGN", label: "RWF → NGN" },
    { from: "NG", fromCcy: "NGN", to: "GH", toCcy: "GHS", label: "NGN → GHS" },
    { from: "NG", fromCcy: "NGN", to: "TZ", toCcy: "TZS", label: "NGN → TZS" },
    { from: "KE", fromCcy: "KES", to: "UG", toCcy: "UGX", label: "KES → UGX" },
    { from: "NG", fromCcy: "NGN", to: "ZA", toCcy: "ZAR", label: "NGN → ZAR" },
  ]

  console.log("\n=== Corridor channel availability (sandbox) ===")
  for (const c of corridors) {
    const recv = active.filter(
      (ch) =>
        ch.rampType === "deposit" &&
        String(ch.country).toUpperCase() === c.from &&
        String(ch.currency).toUpperCase() === c.fromCcy,
    )
    const send = active.filter(
      (ch) =>
        ch.rampType === "withdraw" &&
        String(ch.country).toUpperCase() === c.to &&
        String(ch.currency).toUpperCase() === c.toCcy,
    )
    console.log(`\n${c.label} (Through Local Currency)`)
    console.log(`  receive ${c.from}/${c.fromCcy}: ${recv.length} channel(s)`)
    if (recv[0]) {
      console.log(
        `    sample feeLocal=${recv[0].feeLocal ?? "?"} feeUSD=${recv[0].feeUSD ?? "?"} min=${recv[0].min ?? "?"} max=${recv[0].max ?? "?"}`,
      )
    }
    console.log(`  send ${c.to}/${c.toCcy}: ${send.length} channel(s)`)
    if (send[0]) {
      console.log(
        `    sample feeLocal=${send[0].feeLocal ?? "?"} feeUSD=${send[0].feeUSD ?? "?"} min=${send[0].min ?? "?"} max=${send[0].max ?? "?"}`,
      )
    }
    const fromRate = rates.find((r) => String(r.code).toUpperCase() === c.fromCcy)
    const toRate = rates.find((r) => String(r.code).toUpperCase() === c.toCcy)
    if (fromRate?.sell && toRate?.buy) {
      // Cross via USD: user pays local A; recipient gets local B
      // Approx: $1 = fromRate.sell NGN, $1 buys toRate.buy KES at YC buy rate
      const impliedKesPerNgn = toRate.buy / fromRate.sell
      console.log(
        `  implied FX (YC sell/buy via USD): 1 ${c.fromCcy} ≈ ${impliedKesPerNgn.toFixed(6)} ${c.toCcy} (sandbox rates, not a quote)`,
      )
    }
  }

  // Easner plan fees on top
  console.log("\n=== Easner plan fees (on top of YC) ===")
  console.log("  Processing: YC service + network (per leg) + Easner 1% (review line)")
  console.log("  FX display: +0.5% margin in shown rate (omnibus surplus)")
  console.log("  Settlement: USDC/SOL both legs — no extra chain fee in user copy")

  try {
    const gas = await yellowcardFetch<{ gasFee?: number; gasToken?: string }>({
      method: "POST",
      path: "/sends/fee",
      json: { token: "USDC_SOL" },
    })
    console.log("\n=== YC POST /sends/fee (USDC_SOL) ===")
    console.log(JSON.stringify(gas))
  } catch (e) {
    console.log("\n=== YC POST /sends/fee failed ===", e instanceof Error ? e.message : e)
  }

  console.log("\n=== Sample channel fee fields (NG/KE/RW) ===")
  for (const country of ["NG", "KE", "RW"]) {
    const rows = active.filter((c) => String(c.country).toUpperCase() === country)
    console.log(`\n${country} (${rows.length} active)`)
    for (const r of rows.slice(0, 5)) {
      console.log(
        JSON.stringify({
          rampType: r.rampType,
          currency: r.currency,
          channelType: r.channelType,
          feeLocal: (r as Record<string, unknown>).feeLocal,
          feeUSD: (r as Record<string, unknown>).feeUSD,
          feePercent: (r as Record<string, unknown>).feePercent,
          min: r.min,
          max: r.max,
        }),
      )
    }
  }

  // Worked example: 100,000 NGN → KES
  const ngn = rates.find((r) => r.code === "NGN")
  const kes = rates.find((r) => r.code === "KES")
  const rwf = rates.find((r) => r.code === "RWF")
  if (ngn?.sell && kes?.buy) {
    const payNgn = 100_000
    const usdMid = payNgn / ngn.sell
    const ycServicePct = 0.01 // bank 1% per YC docs
    const easnerProcPct = 0.01
    const easnerFxPct = 0.005
    const ycServiceUsd = usdMid * ycServicePct * 2 // two legs rough
    const easnerProcUsd = usdMid * easnerProcPct
    const kesOut = (usdMid * (1 - easnerFxPct)) * kes.buy
    console.log("\n=== Illustrative quote: 100,000 NGN → KES (sandbox rates, rough) ===")
    console.log(`  Pay-in: ${payNgn.toLocaleString()} NGN`)
    console.log(`  USD notional @ YC NGN sell ${ngn.sell}: ~$${usdMid.toFixed(2)}`)
    console.log(`  Recipient ~${Math.round(kesOut).toLocaleString()} KES @ KES buy ${kes.buy} (after 0.5% Easner FX margin in rate)`)
    console.log(`  YC service ~${(ycServicePct * 100).toFixed(0)}% × 2 legs ≈ $${ycServiceUsd.toFixed(2)} (order-of-magnitude)`)
    console.log(`  Easner processing ~${(easnerProcPct * 100).toFixed(0)}% ≈ $${easnerProcUsd.toFixed(2)} on notional`)
    console.log(`  + YC network/gas per leg (see /sends/fee; directSettlement examples ~$1+ USD)`)
  }
  if (rwf?.sell && ngn?.buy) {
    const payRwf = 100_000
    const usdMid = payRwf / rwf.sell
    const ngnOut = usdMid * 0.995 * (ngn.buy ?? ngn.sell)
    console.log("\n=== Illustrative quote: 100,000 RWF → NGN (sandbox rates, rough) ===")
    console.log(`  Pay-in: ${payRwf.toLocaleString()} RWF`)
    console.log(`  USD notional @ RWF sell ${rwf.sell}: ~$${usdMid.toFixed(2)}`)
    console.log(`  Recipient ~${Math.round(ngnOut).toLocaleString()} NGN (after 0.5% FX margin)`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  if (e && typeof e === "object" && "body" in e) console.error(JSON.stringify((e as { body: unknown }).body, null, 2))
  process.exit(1)
})
