/**
 * Fee breakdown per leg + combined for YC cross-border (Through Local Currency).
 * Sandbox rates; YC service 1% bank / 2% momo per docs; network leg1 scaled from YC doc example.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-yc-fee-breakdown.ts
 */
import { yellowcardFetch } from "../lib/yellowcard/http"
import { getYellowcardEnvironment } from "../lib/yellowcard/config"

type RateRow = { buy?: number; sell?: number; code?: string }
type Channel = {
  id?: string
  country?: string
  currency?: string
  channelType?: string
  rampType?: string
  status?: string
  apiStatus?: string
  min?: number
}

const YC_SERVICE_BANK = 0.01
const YC_SERVICE_MOMO = 0.02
const EASNER_PROCESSING = 0.01
const EASNER_FX_MARGIN = 0.005
/** YC directSettlement receive example: ~$1.13 network on $50 USD notional */
const YC_NETWORK_RECEIVE_USD_PER_USD = 1.13 / 50
const SOL_GAS_USD = 0.2 // ~0.001 SOL order-of-magnitude

type Corridor = {
  label: string
  payLocal: number
  from: string
  fromCcy: string
  to: string
  toCcy: string
  leg1Rail: "bank" | "momo"
  leg2Rail: "bank" | "momo"
}

function servicePct(rail: "bank" | "momo") {
  return rail === "momo" ? YC_SERVICE_MOMO : YC_SERVICE_BANK
}

function breakdown(c: Corridor, rates: RateRow[]) {
  const sellA = rates.find((r) => r.code === c.fromCcy)?.sell
  const buyB = rates.find((r) => r.code === c.toCcy)?.buy
  if (!sellA || !buyB) return null

  const grossUsd = c.payLocal / sellA
  const svc1Pct = servicePct(c.leg1Rail)
  const svc2Pct = servicePct(c.leg2Rail)

  const ycServiceLeg1Usd = grossUsd * svc1Pct
  const ycNetworkLeg1Usd = grossUsd * YC_NETWORK_RECEIVE_USD_PER_USD
  const usdcAfterLeg1 = grossUsd - ycServiceLeg1Usd - ycNetworkLeg1Usd

  const ycServiceLeg2Usd = usdcAfterLeg1 * svc2Pct
  const ycGasLeg2Usd = SOL_GAS_USD
  const usdcForPayout = usdcAfterLeg1 - ycServiceLeg2Usd - ycGasLeg2Usd

  const recipientLocalGross = usdcForPayout * buyB
  const easnerFxUsd = recipientLocalGross / buyB * EASNER_FX_MARGIN // local value of FX skim
  const recipientLocalNet = recipientLocalGross * (1 - EASNER_FX_MARGIN)

  const easnerProcessingUsd = grossUsd * EASNER_PROCESSING

  const ycTotalUsd = ycServiceLeg1Usd + ycNetworkLeg1Usd + ycServiceLeg2Usd + ycGasLeg2Usd
  const easnerTotalUsd = easnerProcessingUsd + easnerFxUsd
  const allInUsd = ycTotalUsd + easnerTotalUsd
  const allInPct = (allInUsd / grossUsd) * 100

  return {
    grossUsd,
    leg1: {
      payLocal: c.payLocal,
      ycServiceUsd: ycServiceLeg1Usd,
      ycServicePct: svc1Pct,
      ycNetworkUsd: ycNetworkLeg1Usd,
      usdcOut: usdcAfterLeg1,
    },
    leg2: {
      ycServiceUsd: ycServiceLeg2Usd,
      ycServicePct: svc2Pct,
      ycGasUsd: ycGasLeg2Usd,
      usdcIn: usdcAfterLeg1,
      usdcForPayout,
      recipientLocalGross,
    },
    easner: {
      processingUsd: easnerProcessingUsd,
      fxMarginUsd: easnerFxUsd,
      recipientLocalNet,
    },
    combined: {
      ycTotalUsd,
      easnerTotalUsd,
      allInUsd,
      allInPct,
    },
  }
}

async function main() {
  console.log("Environment:", getYellowcardEnvironment())
  console.log("Model: USDC/SOL directSettlement both legs\n")

  const ratesResp = await yellowcardFetch<{ rates?: RateRow[] } | RateRow[]>({
    method: "GET",
    path: "/rates",
  })
  const rates = Array.isArray(ratesResp) ? ratesResp : (ratesResp.rates ?? [])

  const corridors: Corridor[] = [
    {
      label: "NGN → KES (bank → bank)",
      payLocal: 100_000,
      from: "NG",
      fromCcy: "NGN",
      to: "KE",
      toCcy: "KES",
      leg1Rail: "bank",
      leg2Rail: "bank",
    },
    {
      label: "NGN → KES (bank → momo)",
      payLocal: 100_000,
      from: "NG",
      fromCcy: "NGN",
      to: "KE",
      toCcy: "KES",
      leg1Rail: "bank",
      leg2Rail: "momo",
    },
    {
      label: "RWF → NGN (bank → bank)",
      payLocal: 100_000,
      from: "RW",
      fromCcy: "RWF",
      to: "NG",
      toCcy: "NGN",
      leg1Rail: "bank",
      leg2Rail: "bank",
    },
    {
      label: "NGN → GHS (bank → bank)",
      payLocal: 100_000,
      from: "NG",
      fromCcy: "NGN",
      to: "GH",
      toCcy: "GHS",
      leg1Rail: "bank",
      leg2Rail: "bank",
    },
    {
      label: "NGN → TZS (bank → bank)",
      payLocal: 100_000,
      from: "NG",
      fromCcy: "NGN",
      to: "TZ",
      toCcy: "TZS",
      leg1Rail: "bank",
      leg2Rail: "bank",
    },
    {
      label: "KES → UGX (bank → bank)",
      payLocal: 10_000,
      from: "KE",
      fromCcy: "KES",
      to: "UG",
      toCcy: "UGX",
      leg1Rail: "bank",
      leg2Rail: "bank",
    },
    {
      label: "NGN → ZAR (bank → bank)",
      payLocal: 100_000,
      from: "NG",
      fromCcy: "NGN",
      to: "ZA",
      toCcy: "ZAR",
      leg1Rail: "bank",
      leg2Rail: "bank",
    },
  ]

  for (const c of corridors) {
    const b = breakdown(c, rates)
    if (!b) {
      console.log(`\n${c.label}: missing rates`)
      continue
    }
    console.log("=".repeat(72))
    console.log(c.label)
    console.log("=".repeat(72))
    console.log(`Pay-in: ${c.payLocal.toLocaleString()} ${c.fromCcy}  (~$${b.grossUsd.toFixed(2)} USD gross)`)
    console.log("")
    console.log("LEG 1 — YC Receive (local → USDC/SOL omnibus)")
    console.log(`  YC service (${(b.leg1.ycServicePct * 100).toFixed(0)}%)     $${b.leg1.ycServiceUsd.toFixed(2)}`)
    console.log(`  YC network (est.)    $${b.leg1.ycNetworkUsd.toFixed(2)}`)
    console.log(`  USDC to omnibus      $${b.leg1.usdcOut.toFixed(2)}`)
    console.log("")
    console.log("LEG 2 — YC Send (USDC/SOL → recipient local)")
    console.log(`  YC service (${(b.leg2.ycServicePct * 100).toFixed(0)}%)     $${b.leg2.ycServiceUsd.toFixed(2)}`)
    console.log(`  YC gas USDC/SOL      $${b.leg2.ycGasUsd.toFixed(2)}`)
    console.log(`  USDC for payout      $${b.leg2.usdcForPayout.toFixed(2)}`)
    console.log(`  Recipient (pre-Easner FX) ${Math.round(b.leg2.recipientLocalGross).toLocaleString()} ${c.toCcy}`)
    console.log("")
    console.log("EASNER (whole transfer)")
    console.log(`  Processing (1%)      $${b.easner.processingUsd.toFixed(2)}  (review line)`)
    console.log(`  FX margin (0.5%)     $${b.easner.fxMarginUsd.toFixed(2)}  (in rate, not separate line)`)
    console.log(`  Recipient NET        ${Math.round(b.easner.recipientLocalNet).toLocaleString()} ${c.toCcy}`)
    console.log("")
    console.log("COMBINED FEES (USD equivalent)")
    console.log(`  YC total             $${b.combined.ycTotalUsd.toFixed(2)}`)
    console.log(`  Easner total         $${b.combined.easnerTotalUsd.toFixed(2)}`)
    console.log(`  All-in               $${b.combined.allInUsd.toFixed(2)}  (${b.combined.allInPct.toFixed(2)}% of gross USD)`)
  }

  console.log("\n" + "=".repeat(72))
  console.log("NOTES")
  console.log("- Sandbox /rates; production will differ.")
  console.log("- YC network leg1 scaled from doc example ($1.13 on $50); confirm via POST /receive quote.")
  console.log("- MoMo legs use 2% YC service vs 1% bank.")
  console.log("- fund_balance = Leg 1 only + Easner fees; balance_payout (YC) = Leg 2 only + Easner fees.")
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
