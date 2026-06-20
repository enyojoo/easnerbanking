/**
 * Print wallet-send confirm-style pricing per corridor (LI.FI bridge + direct Turnkey).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
 *   cd business && RECEIVE_AMOUNT=50 SOURCE_CURRENCY=USD node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-send-pricing.ts
 *
 * Requires:
 *   CRYPTO_RATES_PROBE_SOL_ADDRESS — Solana vault used for LI.FI quotes (same as rate sync)
 *   LIFI_API_KEY — optional but recommended
 *
 * Env overrides:
 *   RECEIVE_AMOUNT — recipient amount to target (default 100)
 *   SOURCE_CURRENCY — USD | EUR balance bucket (default USD)
 */
import { applyCryptoCustomerRate, parseWalletSendMarginFromEnv } from "@easner/rate-sync"
import {
  computeCryptoSendPricing,
  resolveLifiTicketPricingInput,
} from "../../packages/shared/src/crypto-send-pricing"
import {
  computeDirectTurnkeyWalletSendPricing,
  parseWalletSendProcessingFeeBpsFromEnv,
  parseWalletSendProcessingFeeCapFromEnv,
} from "../../packages/shared/src/direct-turnkey-wallet-send-pricing"
import type { LifiQuoteResponse } from "../lib/lifi/client"
import { lifiQuote } from "../lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/lifi/token-map"
import { parseLifiToAmountHuman } from "../lib/wallet-send/lifi-from-amount"
import { listWalletSendCorridors } from "../lib/wallet-send/corridors"
import { isDirectTurnkeyCorridor } from "../lib/wallet-send/routing"
import { quoteLifiWalletBridge } from "../lib/wallet-send/lifi-wallet-quote"

function parseLifiNetworkFeeUsd(quote: LifiQuoteResponse): number {
  const gas = quote.estimate?.gasCosts ?? []
  const fees = quote.estimate?.feeCosts ?? []
  let total = 0
  for (const row of [...gas, ...fees]) {
    if (row.included) continue
    const usd = Number(row.amountUSD ?? 0)
    if (Number.isFinite(usd) && usd > 0) total += usd
  }
  return Math.round(total * 100) / 100
}

function pricingFromLifiQuote(input: {
  receiveAmount: number
  customerRate: number
  lifiMid: number
  quote: LifiQuoteResponse
  sourceDecimals: number
}) {
  const fromRaw = Number(input.quote.estimate?.fromAmount ?? 0)
  const lifiFloor = fromRaw / 10 ** input.sourceDecimals
  const { customerRate, lifiMid } = resolveLifiTicketPricingInput({
    receiveAmount: input.receiveAmount,
    planningCustomerRate: input.customerRate,
    planningLifiMid: input.lifiMid,
    lifiFloor,
    margin: parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN),
  })
  return computeCryptoSendPricing({
    receiveAmount: input.receiveAmount,
    customerRate,
    lifiMid,
    lifiFloor,
    networkFee: parseLifiNetworkFeeUsd(input.quote),
  })
}

function pricingFromDirectTurnkey(receiveAmount: number) {
  return computeDirectTurnkeyWalletSendPricing({
    receiveAmount,
    feeBps: parseWalletSendProcessingFeeBpsFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_BPS),
    feeCap: parseWalletSendProcessingFeeCapFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_CAP),
  })
}

const PROBE_FROM = process.env.CRYPTO_RATES_PROBE_SOL_ADDRESS || ""
const PROBE_TO_TRON = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
const PROBE_TO_EVM = "0x0000000000000000000000000000000000000001"
const PROBE_TO_SOL = "11111111111111111111111111111112"

function dummyTo(network: string): string {
  if (network === "Tron") return PROBE_TO_TRON
  if (network === "Solana") return PROBE_TO_SOL
  return PROBE_TO_EVM
}

function parseReceiveAmount(): number {
  const raw = process.argv[2] ?? process.env.RECEIVE_AMOUNT ?? "100"
  const n = Number.parseFloat(String(raw))
  if (!Number.isFinite(n) || n <= 0) throw new Error("RECEIVE_AMOUNT must be a positive number")
  return n
}

function parseSourceCurrency(): "USD" | "EUR" {
  const c = String(process.env.SOURCE_CURRENCY || "USD")
    .trim()
    .toUpperCase()
  if (c !== "USD" && c !== "EUR") throw new Error("SOURCE_CURRENCY must be USD or EUR")
  return c
}

function fmt(n: number, digits = 4): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—"
}

type Row = {
  corridor: string
  model: string
  tool: string
  lifiMid: number
  customerRate: number
  receiveAmount: number
  youSend: number
  exchangeFee: number
  processingFee: number
  networkFee: number
  totalDebited: number
  lifiFloor: number
  error?: string
}

async function probeLifiMid(
  source: ReturnType<typeof sourceSolVaultToken>,
  dest: NonNullable<ReturnType<typeof resolveWalletSendToken>>,
): Promise<{ lifiMid: number; tool: string }> {
  const quote = await lifiQuote({
    fromChain: source.chainId,
    toChain: dest.chainId,
    fromToken: source.address,
    toToken: dest.address,
    fromAddress: PROBE_FROM,
    toAddress: dummyTo(dest.network),
    fromAmount: "100000000",
    fee: 0,
  })
  const fromAmt = Number(quote.estimate?.fromAmount ?? 0) / 10 ** source.decimals
  const toAmt = Number(quote.estimate?.toAmount ?? 0) / 10 ** dest.decimals
  if (!Number.isFinite(fromAmt) || !Number.isFinite(toAmt) || fromAmt <= 0 || toAmt <= 0) {
    throw new Error("invalid LI.FI mid probe amounts")
  }
  return { lifiMid: toAmt / fromAmt, tool: String(quote.tool ?? "?") }
}

async function rowForLifiBridge(input: {
  sourceCurrency: "USD" | "EUR"
  asset: string
  network: string
  receiveAmount: number
}): Promise<Row> {
  const corridor = `${input.asset}/${input.network}`
  if (!PROBE_FROM) {
    return {
      corridor,
      model: "lifi_bridge",
      tool: "—",
      lifiMid: 0,
      customerRate: 0,
      receiveAmount: input.receiveAmount,
      youSend: 0,
      exchangeFee: 0,
      processingFee: 0,
      networkFee: 0,
      totalDebited: 0,
      lifiFloor: 0,
      error: "CRYPTO_RATES_PROBE_SOL_ADDRESS unset",
    }
  }

  const source = sourceSolVaultToken(input.sourceCurrency)
  const dest = resolveWalletSendToken(input.asset, input.network)
  if (!dest) {
    return {
      corridor,
      model: "lifi_bridge",
      tool: "—",
      lifiMid: 0,
      customerRate: 0,
      receiveAmount: input.receiveAmount,
      youSend: 0,
      exchangeFee: 0,
      processingFee: 0,
      networkFee: 0,
      totalDebited: 0,
      lifiFloor: 0,
      error: "token map missing",
    }
  }

  try {
    const margin = parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)
    const { lifiMid, tool } = await probeLifiMid(source, dest)
    const customerRate = applyCryptoCustomerRate(lifiMid, margin)

    const bridgeQuote = await quoteLifiWalletBridge({
      source,
      dest,
      fromAddress: PROBE_FROM,
      toAddress: dummyTo(dest.network),
      amountEntryMode: "receive",
      receiveAmount: input.receiveAmount,
      customerRate,
      lifiMid,
    })

    const p = pricingFromLifiQuote({
      receiveAmount: input.receiveAmount,
      customerRate,
      lifiMid,
      quote: bridgeQuote,
      sourceDecimals: source.decimals,
    })
    return {
      corridor,
      model: "lifi_bridge",
      tool,
      lifiMid: p.lifiMid,
      customerRate: p.customerRate,
      receiveAmount: p.receiveAmount,
      youSend: p.customerPrincipal,
      exchangeFee: p.routeCost,
      processingFee: p.marginAmount,
      networkFee: p.networkFee,
      totalDebited: p.totalDebited,
      lifiFloor: p.lifiFloor,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      corridor,
      model: "lifi_bridge",
      tool: "—",
      lifiMid: 0,
      customerRate: 0,
      receiveAmount: input.receiveAmount,
      youSend: 0,
      exchangeFee: 0,
      processingFee: 0,
      networkFee: 0,
      totalDebited: 0,
      lifiFloor: 0,
      error: msg.slice(0, 120),
    }
  }
}

function rowForDirectTurnkey(input: {
  asset: string
  network: string
  receiveAmount: number
}): Row {
  const p = pricingFromDirectTurnkey(input.receiveAmount)
  return {
    corridor: `${input.asset}/${input.network}`,
    model: "direct_turnkey",
    tool: "turnkey_spl",
    lifiMid: 1,
    customerRate: 1,
    receiveAmount: p.receiveAmount,
    youSend: p.customerPrincipal,
    exchangeFee: p.routeCost,
    processingFee: p.marginAmount,
    networkFee: p.networkFee,
    totalDebited: p.totalDebited,
    lifiFloor: p.lifiFloor,
  }
}

function printTable(rows: Row[], sourceCurrency: "USD" | "EUR", receiveAmount: number) {
  const margin = parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)
  const feeBps = parseWalletSendProcessingFeeBpsFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_BPS)
  const feeCap = parseWalletSendProcessingFeeCapFromEnv(process.env.WALLET_SEND_PROCESSING_FEE_CAP)

  console.log("Wallet send pricing probe (confirm-style breakdown)")
  console.log(`Source balance: ${sourceCurrency} · vault: ${sourceCurrency === "EUR" ? "EURC" : "USDC"}/Solana`)
  console.log(`Recipient gets: ${receiveAmount} (receive entry mode)`)
  console.log(
    `LI.FI: fee=0 integrator param · WALLET_SEND_MARGIN ${(margin * 100).toFixed(2)}% · direct fee ${feeBps} bps cap ${feeCap}`,
  )
  console.log("")

  const header = [
    "corridor",
    "model",
    "tool",
    "lifi_mid",
    "cust_rate",
    "recipient",
    "you_send",
    "exch_fee",
    "proc_fee",
    "net_fee",
    "total_db",
    "lifi_floor",
    "status",
  ].join("\t")

  console.log(header)
  for (const r of rows) {
    if (r.error) {
      console.log(
        [
          r.corridor,
          r.model,
          "—",
          "—",
          "—",
          fmt(r.receiveAmount, 2),
          "—",
          "—",
          "—",
          "—",
          "—",
          "—",
          `FAIL ${r.error}`,
        ].join("\t"),
      )
      continue
    }
    console.log(
      [
        r.corridor,
        r.model,
        r.tool,
        fmt(r.lifiMid, 6),
        fmt(r.customerRate, 6),
        fmt(r.receiveAmount, 2),
        fmt(r.youSend, 4),
        fmt(r.exchangeFee, 4),
        fmt(r.processingFee, 4),
        fmt(r.networkFee, 4),
        fmt(r.totalDebited, 4),
        fmt(r.lifiFloor, 4),
        "OK",
      ].join("\t"),
    )
  }

  console.log("\nColumn notes:")
  console.log("  recipient  = Recipient gets")
  console.log("  you_send   = You send (customerPrincipal)")
  console.log("  exch_fee   = Exchange fee (LI.FI route vs mid)")
  console.log("  proc_fee   = Processing fee (Easner marginAmount)")
  console.log("  net_fee    = Network fee (LI.FI gas USD, when shown)")
  console.log("  total_db   = Total debited from USD/EUR balance")
  console.log("  lifi_floor = USDC/EURC sent from Solana vault (LI.FI fromAmount)")
}

async function main() {
  const receiveAmount = parseReceiveAmount()
  const sourceCurrency = parseSourceCurrency()
  const corridors = listWalletSendCorridors().filter((c) => c.enabled)
  const rows: Row[] = []

  for (const c of corridors) {
    if (isDirectTurnkeyCorridor(c.asset, c.network)) {
      if (
        (sourceCurrency === "EUR" && c.asset !== "EURC") ||
        (sourceCurrency === "USD" && c.asset === "EURC")
      ) {
        continue
      }
      rows.push(rowForDirectTurnkey({ asset: c.asset, network: c.network, receiveAmount }))
      continue
    }

    if (sourceCurrency === "EUR" && c.asset !== "EURC") continue
    if (sourceCurrency === "USD" && c.asset === "EURC") continue

    rows.push(
      await rowForLifiBridge({
        sourceCurrency,
        asset: c.asset,
        network: c.network,
        receiveAmount,
      }),
    )
  }

  printTable(rows, sourceCurrency, receiveAmount)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
