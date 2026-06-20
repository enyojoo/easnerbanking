/**
 * Compare LI.FI explicit fees vs route output for USDT/Tron.
 * cd business && node --env-file=.env.local --import tsx scripts/probe-usdt-tron-fees.ts
 */
import { applyCryptoCustomerRate, parseWalletSendMarginFromEnv } from "@easner/rate-sync"
import { computeCryptoSendPricing, resolveLifiTicketPricingInput } from "../../packages/shared/src/crypto-send-pricing"
import { lifiQuote } from "../lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/lifi/token-map"
import { parseLifiToAmountHuman } from "../lib/wallet-send/lifi-from-amount"
import { quoteLifiWalletBridge } from "../lib/wallet-send/lifi-wallet-quote"

const PROBE_FROM = process.env.CRYPTO_RATES_PROBE_SOL_ADDRESS || ""
const PROBE_TO_TRON = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
const PROBE_TO_SOL = "11111111111111111111111111111112"

function feeUsd(q: Awaited<ReturnType<typeof lifiQuote>>): number {
  let t = 0
  for (const row of [...(q.estimate?.gasCosts ?? []), ...(q.estimate?.feeCosts ?? [])]) {
    if (row.included) continue
    const u = Number(row.amountUSD ?? 0)
    if (u > 0) t += u
  }
  return Math.round(t * 100) / 100
}

async function quoteRow(fromUsdc: number, label: string) {
  const source = sourceSolVaultToken("USD")
  const dest = resolveWalletSendToken("USDT", "Tron")!
  const q = await lifiQuote({
    fromChain: source.chainId,
    toChain: dest.chainId,
    fromToken: source.address,
    toToken: dest.address,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    fromAmount: String(Math.round(fromUsdc * 1e6)),
    fee: 0,
    slippage: 0.03,
  })
  const floor = Number(q.estimate?.fromAmount) / 1e6
  const toAmt = parseLifiToAmountHuman(q, 6)
  const spread = floor - toAmt
  console.log(
    `${label}: ${floor.toFixed(2)} USDC in → ${toAmt.toFixed(2)} USDT out | ` +
      `gap ${spread.toFixed(2)} (~${((spread / floor) * 100).toFixed(1)}%) | ` +
      `LI.FI line-item fees $${feeUsd(q)} | ${q.tool}`,
  )
}

async function main() {
  if (!PROBE_FROM) throw new Error("CRYPTO_RATES_PROBE_SOL_ADDRESS unset")

  const margin = parseWalletSendMarginFromEnv(process.env.WALLET_SEND_MARGIN)
  const lifiMid = 0.978
  const customerRate = applyCryptoCustomerRate(lifiMid, margin)

  console.log("=== If user sends $N USDC (send mode) — USDT/Tron ===\n")
  for (const a of [7, 10, 20, 50]) {
    await quoteRow(a, `$${a}`)
  }

  const source = sourceSolVaultToken("USD")
  const dest = resolveWalletSendToken("USDT", "Tron")!
  console.log("\n=== Same $10 USDC — USDT/Solana (works normally) ===\n")
  const destSol = resolveWalletSendToken("USDT", "Solana")!
  const qSol = await lifiQuote({
    fromChain: source.chainId,
    toChain: destSol.chainId,
    fromToken: source.address,
    toToken: destSol.address,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_SOL,
    fromAmount: "10000000",
    fee: 0,
    slippage: 0.03,
  })
  const toSol = parseLifiToAmountHuman(qSol, 6)
  console.log(
    `$10 USDC → ${toSol.toFixed(2)} USDT on Solana | gap ${(10 - toSol).toFixed(2)} | fees $${feeUsd(qSol)} | ${qSol.tool}`,
  )

  console.log("\n=== Send mode: user sends $10 USDC — USDT/Tron (via quoteLifiWalletBridge) ===\n")
  const sendQuote = await quoteLifiWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    amountEntryMode: "send",
    receiveAmount: 0,
    sendBudget: 10,
    customerRate,
    lifiMid,
  })
  const sendReceive = parseLifiToAmountHuman(sendQuote, 6)
  const sendFloor = Number(sendQuote.estimate?.fromAmount) / 1e6
  const { customerRate: sendCr, lifiMid: sendMid } = resolveLifiTicketPricingInput({
    receiveAmount: sendReceive,
    planningCustomerRate: customerRate,
    planningLifiMid: lifiMid,
    lifiFloor: sendFloor,
    margin,
  })
  const sendPricing = computeCryptoSendPricing({
    receiveAmount: sendReceive,
    customerRate: sendCr,
    lifiMid: sendMid,
    lifiFloor: sendFloor,
  })
  console.log(
    `Send $10 → debit $${sendPricing.totalDebited.toFixed(2)} | recipient ${sendReceive.toFixed(2)} USDT | lifiFloor $${sendPricing.lifiFloor.toFixed(2)}`,
  )

  console.log("\n=== Receive mode: user wants 8 USDT on Tron (should match send $10) ===\n")
  const recvTarget = Math.round(sendReceive * 100) / 100
  const recvQuote = await quoteLifiWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    amountEntryMode: "receive",
    receiveAmount: recvTarget,
    customerRate,
    lifiMid,
  })
  const recvFloor = Number(recvQuote.estimate?.fromAmount) / 1e6
  const { customerRate: recvCr, lifiMid: recvMid } = resolveLifiTicketPricingInput({
    receiveAmount: recvTarget,
    planningCustomerRate: customerRate,
    planningLifiMid: lifiMid,
    lifiFloor: recvFloor,
    margin,
  })
  const recvPricing = computeCryptoSendPricing({
    receiveAmount: recvTarget,
    customerRate: recvCr,
    lifiMid: recvMid,
    lifiFloor: recvFloor,
  })
  console.log(
    `Receive ${sendReceive.toFixed(2)} USDT → debit $${recvPricing.totalDebited.toFixed(2)} | lifiFloor $${recvPricing.lifiFloor.toFixed(2)}`,
  )

  console.log("\n=== Receive mode: user wants 10 USDT on Tron ===\n")
  const recv10Quote = await quoteLifiWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: PROBE_TO_TRON,
    amountEntryMode: "receive",
    receiveAmount: 10,
    customerRate,
    lifiMid,
  })
  const recv10Floor = Number(recv10Quote.estimate?.fromAmount) / 1e6
  const { customerRate: r10Cr, lifiMid: r10Mid } = resolveLifiTicketPricingInput({
    receiveAmount: 10,
    planningCustomerRate: customerRate,
    planningLifiMid: lifiMid,
    lifiFloor: recv10Floor,
    margin,
  })
  const recv10Pricing = computeCryptoSendPricing({
    receiveAmount: 10,
    customerRate: r10Cr,
    lifiMid: r10Mid,
    lifiFloor: recv10Floor,
  })
  const recv10Out = parseLifiToAmountHuman(recv10Quote, 6)
  console.log(
    `Receive 10 USDT → debit $${recv10Pricing.totalDebited.toFixed(2)} | lifiFloor $${recv10Pricing.lifiFloor.toFixed(2)} | on-chain ~${recv10Out.toFixed(2)} USDT`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
