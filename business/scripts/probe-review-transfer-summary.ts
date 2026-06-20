/**
 * Confirm-style review transfer summary: send vs receive, planning vs execution.
 * cd business && node --env-file=.env.local --import tsx scripts/probe-review-transfer-summary.ts
 */
import { applyCryptoCustomerRate, parseWalletSendMarginFromEnv } from "@easner/rate-sync"
import {
  computeCryptoSendPricing,
  resolveLifiTicketPricingInput,
} from "../../packages/shared/src/crypto-send-pricing"
import { lifiQuote } from "../lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/lifi/token-map"
import { parseLifiToAmountHuman } from "../lib/wallet-send/lifi-from-amount"
import { quoteLifiWalletBridge } from "../lib/wallet-send/lifi-wallet-quote"

const PROBE_FROM = process.env.CRYPTO_RATES_PROBE_SOL_ADDRESS || ""
const PROBE_TO_TRON = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"

type ReviewRow = {
  label: string
  receiveAmount: number
  planningCr: number
  planningMid: number
  ticketCr: number
  ticketMid: number
  youSend: number
  exchangeFee: number
  processingFee: number
  totalDebited: number
  lifiFloor: number
}

function buildReview(
  label: string,
  receiveAmount: number,
  planningCr: number,
  planningMid: number,
  lifiFloor: number,
  margin: number,
): ReviewRow {
  const { customerRate, lifiMid } = resolveLifiTicketPricingInput({
    receiveAmount,
    planningCustomerRate: planningCr,
    planningLifiMid: planningMid,
    lifiFloor,
    margin,
  })
  const p = computeCryptoSendPricing({ receiveAmount, customerRate, lifiMid, lifiFloor })
  return {
    label,
    receiveAmount,
    planningCr,
    planningMid,
    ticketCr: customerRate,
    ticketMid: lifiMid,
    youSend: p.customerPrincipal,
    exchangeFee: p.routeCost,
    processingFee: p.marginAmount,
    totalDebited: p.totalDebited,
    lifiFloor: p.lifiFloor,
  }
}

function printReview(r: ReviewRow) {
  console.log(`--- ${r.label} ---`)
  console.log(
    `Planning (crypto_rates):  lifi_mid=${r.planningMid.toFixed(6)}  customer_rate=${r.planningCr.toFixed(6)}`,
  )
  console.log(
    `Execution (ticket):       lifi_mid=${r.ticketMid.toFixed(6)}  customer_rate=${r.ticketCr.toFixed(6)}`,
  )
  console.log(`Exchange rate (confirm):  1 USD = ${r.ticketCr.toFixed(4)} USDT`)
  console.log(`Recipient gets:           ${r.receiveAmount.toFixed(2)} USDT`)
  console.log(`You send:                 $${r.youSend.toFixed(2)}`)
  console.log(`Exchange fee:             $${r.exchangeFee.toFixed(2)}`)
  console.log(`Processing fee (hidden):  $${r.processingFee.toFixed(2)}`)
  console.log(`Total debited:            $${r.totalDebited.toFixed(2)}`)
  console.log(`LI.FI vault out (floor):  $${r.lifiFloor.toFixed(2)} USDC`)
  console.log("")
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (!PROBE_FROM) throw new Error("CRYPTO_RATES_PROBE_SOL_ADDRESS unset")

  const margin = parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)
  const source = sourceSolVaultToken("USD")
  const dest = resolveWalletSendToken("USDT", "Tron")!

  const midProbe = await lifiQuote({
    fromChain: source.chainId,
    toChain: dest.chainId,
    fromToken: source.address,
    toToken: dest.address,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    fromAmount: "100000000",
    fee: 0,
    slippage: 0.03,
  })
  const probeIn = Number(midProbe.estimate?.fromAmount) / 1e6
  const probeOut = parseLifiToAmountHuman(midProbe, 6)
  const planningMid = probeOut / probeIn
  const planningCr = applyCryptoCustomerRate(planningMid, margin)

  console.log("=== Review transfer summary · USDT/Tron (LI.FI bridge) ===")
  console.log(`DB-style mid probe ($100): lifi_mid=${planningMid.toFixed(6)} · tool=${midProbe.tool}`)
  console.log(`Easner margin: ${(margin * 100).toFixed(2)}% · LI.FI integrator fee param: 0`)
  console.log("")

  const sendQuote = await quoteLifiWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    amountEntryMode: "send",
    receiveAmount: 0,
    sendBudget: 10,
    customerRate: planningCr,
    lifiMid: planningMid,
  })
  const sendReceive = parseLifiToAmountHuman(sendQuote, 6)
  const sendFloor = Number(sendQuote.estimate?.fromAmount) / 1e6
  printReview(
    buildReview("SEND — user enters $10", sendReceive, planningCr, planningMid, sendFloor, margin),
  )

  const parityTarget = Math.round(sendReceive * 100) / 100
  await sleep(2000)
  const recvParityQuote = await quoteLifiWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    amountEntryMode: "receive",
    receiveAmount: parityTarget,
    customerRate: planningCr,
    lifiMid: planningMid,
  })
  const recvParityFloor = Number(recvParityQuote.estimate?.fromAmount) / 1e6
  printReview(
    buildReview(
      `RECEIVE — user wants ${parityTarget.toFixed(2)} USDT (send-$10 parity)`,
      parityTarget,
      planningCr,
      planningMid,
      recvParityFloor,
      margin,
    ),
  )

  await sleep(2000)
  const recv10Quote = await quoteLifiWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    amountEntryMode: "receive",
    receiveAmount: 10,
    customerRate: planningCr,
    lifiMid: planningMid,
  })
  const recv10Floor = Number(recv10Quote.estimate?.fromAmount) / 1e6
  printReview(
    buildReview("RECEIVE — user wants 10 USDT", 10, planningCr, planningMid, recv10Floor, margin),
  )

  console.log("--- AMOUNT SCREEN (planning only, before confirm quote) ---")
  console.log(`Send $10 × DB customer_rate (${planningCr.toFixed(4)}) ≈ ${(10 * planningCr).toFixed(2)} USDT shown`)
  console.log("(Confirm uses live LI.FI ticket mid — typically lower on Tron)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
