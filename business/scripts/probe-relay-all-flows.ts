/**
 * Probe every Relay flow Easner uses today:
 * - Tron USDT pay-in (deposit address provision)
 * - Wallet-send payout (all relay_bridge corridors)
 * - Balance convert USD↔EUR
 * - Crypto rate sync quote shape (EXACT_INPUT reference)
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-relay-all-flows.ts
 */
import { relayQuote } from "../lib/relay/quote"
import {
  extractRelayDepositAddress,
  extractRelayRequestId,
  parseRelayFromAmountRaw,
  parseRelayToAmountHuman,
} from "../lib/relay/quote"
import { isRelayConfigured, resolveCryptoRatesProbeSolAddress } from "../lib/relay/config"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/relay/token-map"
import { listWalletSendCorridors } from "../lib/wallet-send/corridors"
import { quoteRelayWalletBridge } from "../lib/wallet-send/relay-wallet-quote"

const RECEIVE_AMOUNT = Number(process.env.RECEIVE_AMOUNT || "100")
const CONVERT_AMOUNT = Number(process.env.CONVERT_AMOUNT || "10")
const PAUSE_MS = Number(process.env.RELAY_PROBE_PAUSE_MS || "4000")

const PROBE_FROM = resolveCryptoRatesProbeSolAddress() || ""
const PROBE_VAULT_ATA = PROBE_FROM || "4RQ7cT6cxrsL7F8m6VBDUix1N8J4TjjA7dB6dfSbWMdh"
const PROBE_TO_TRON = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"
/** Platform placeholder for Tron-origin deposit quotes (Relay validates `user` on origin chain). */
const PROBE_TRON_USER = PROBE_TO_TRON
const PROBE_TO_EVM = "0x0000000000000000000000000000000000000001"
const PROBE_TO_SOL = "11111111111111111111111111111112"

type FlowResult = {
  flow: string
  ok: boolean
  detail?: Record<string, unknown>
  error?: string
}

const results: FlowResult[] = []

function dummyTo(network: string): string {
  if (network === "Tron") return PROBE_TO_TRON
  if (network === "Solana") return PROBE_TO_SOL
  return PROBE_TO_EVM
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runFlow(flow: string, fn: () => Promise<Record<string, unknown>>): Promise<void> {
  try {
    const detail = await fn()
    results.push({ flow, ok: true, detail })
    console.log(`✓ ${flow}`, detail)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    results.push({ flow, ok: false, error })
    console.log(`✗ ${flow}`, error)
  }
  await sleep(PAUSE_MS)
}

async function probeTronUsdtPayIn(): Promise<Record<string, unknown>> {
  const source = resolveWalletSendToken("USDT", "Tron")
  const dest = sourceSolVaultToken("USD")
  if (!source || !dest) throw new Error("token map missing")

  // Production path (Solana vault as user+recipient) — documents current provision-address.ts behavior.
  try {
    await relayQuote({
      user: PROBE_VAULT_ATA,
      recipient: PROBE_VAULT_ATA,
      source,
      dest,
      amountRaw: "1000000",
      tradeType: "EXACT_INPUT",
      useDepositAddress: true,
    })
  } catch (productionErr) {
    const productionError =
      productionErr instanceof Error ? productionErr.message : String(productionErr)

    // Relay requires a Tron `user` when origin is Tron; Solana recipient + refundTo on Tron.
    const quote = await relayQuote({
      user: PROBE_TRON_USER,
      recipient: PROBE_VAULT_ATA,
      source,
      dest,
      amountRaw: "1000000",
      tradeType: "EXACT_INPUT",
      useDepositAddress: true,
      refundTo: PROBE_TRON_USER,
    })

    const tronAddress = extractRelayDepositAddress(quote)
    if (!tronAddress) throw new Error("deposit address missing from quote")

    return {
      productionPathError: productionError.slice(0, 160),
      tronDepositAddress: tronAddress,
      requestId: extractRelayRequestId(quote),
      note: "Relay route OK; production provision-address.ts needs Tron user + refundTo (see productionPathError)",
    }
  }

  const tronAddress = extractRelayDepositAddress(
    await relayQuote({
      user: PROBE_VAULT_ATA,
      recipient: PROBE_VAULT_ATA,
      source,
      dest,
      amountRaw: "1000000",
      tradeType: "EXACT_INPUT",
      useDepositAddress: true,
    }),
  )
  if (!tronAddress) throw new Error("deposit address missing from quote")
  return { tronDepositAddress: tronAddress, productionPath: "ok" }
}

async function probeWalletSendPayout(asset: string, network: string): Promise<Record<string, unknown>> {
  const source = sourceSolVaultToken("USD")
  const dest = resolveWalletSendToken(asset, network)
  if (!dest) throw new Error("token map missing")

  const quote = await quoteRelayWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: dummyTo(network),
    amountEntryMode: "receive",
    receiveAmount: RECEIVE_AMOUNT,
    customerRate: 1,
    bridgeMid: 1,
  })

  return {
    asset,
    network,
    requestId: extractRelayRequestId(quote),
    fromRaw: parseRelayFromAmountRaw(quote),
    toHuman: parseRelayToAmountHuman(quote, dest.decimals),
  }
}

async function probeRateSyncQuote(asset: string, network: string): Promise<Record<string, unknown>> {
  const source = sourceSolVaultToken("USD")
  const dest = resolveWalletSendToken(asset, network)
  if (!dest) throw new Error("token map missing")

  const quote = await relayQuote({
    user: PROBE_FROM,
    recipient: dummyTo(network),
    source,
    dest,
    amountRaw: "100000000",
    tradeType: "EXACT_INPUT",
  })

  const fromRaw = Number(quote.details?.currencyIn?.amount ?? 0)
  const toRaw = Number(quote.details?.currencyOut?.amount ?? 0)
  const fromAmt = fromRaw / 10 ** source.decimals
  const toAmt = toRaw / 10 ** dest.decimals
  if (!Number.isFinite(fromAmt) || !Number.isFinite(toAmt) || fromAmt <= 0 || toAmt <= 0) {
    throw new Error("invalid quote amounts")
  }

  return {
    asset,
    network,
    fromUsdc: fromAmt,
    toReceive: toAmt,
    mid: toAmt / fromAmt,
    requestId: extractRelayRequestId(quote),
  }
}

async function probeBalanceConvert(direction: "usd_to_eur" | "eur_to_usd"): Promise<Record<string, unknown>> {
  const source =
    direction === "usd_to_eur" ? sourceSolVaultToken("USD") : sourceSolVaultToken("EUR")
  const dest =
    direction === "usd_to_eur" ? sourceSolVaultToken("EUR") : sourceSolVaultToken("USD")

  const amountRaw = String(Math.round(CONVERT_AMOUNT * 10 ** source.decimals))
  const quote = await relayQuote({
    user: PROBE_FROM,
    recipient: PROBE_FROM,
    source,
    dest,
    amountRaw,
    tradeType: "EXACT_INPUT",
  })

  return {
    direction,
    sourceAmount: CONVERT_AMOUNT,
    destinationAmount: parseRelayToAmountHuman(quote, dest.decimals),
    requestId: extractRelayRequestId(quote),
    fromRaw: parseRelayFromAmountRaw(quote),
  }
}

async function main() {
  if (!isRelayConfigured()) throw new Error("RELAY_API_KEY not set")
  if (!PROBE_FROM) throw new Error("DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD not set")

  console.log("Relay all-flows probe")
  console.log({ probeFrom: PROBE_FROM, receiveAmount: RECEIVE_AMOUNT, pauseMs: PAUSE_MS })
  console.log("")

  await runFlow("pay-in: USDT/Tron deposit address → USDC/Solana vault", probeTronUsdtPayIn)

  const relayCorridors = listWalletSendCorridors().filter(
    (c) => c.enabled && c.executionModel === "relay_bridge",
  )

  for (const c of relayCorridors) {
    await runFlow(`payout: USD → ${c.asset}/${c.network} (wallet send)`, () =>
      probeWalletSendPayout(c.asset, c.network),
    )
  }

  for (const c of relayCorridors) {
    await runFlow(`rates: USD → ${c.asset}/${c.network} (crypto sync)`, () =>
      probeRateSyncQuote(c.asset, c.network),
    )
  }

  await runFlow("convert: USD → EUR (USDC → EURC)", () => probeBalanceConvert("usd_to_eur"))
  await runFlow("convert: EUR → USD (EURC → USDC)", () => probeBalanceConvert("eur_to_usd"))

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  console.log("")
  console.log("=== Summary ===")
  console.log(`${passed}/${results.length} flows OK`)

  if (failed.length) {
    console.log("\nFailed:")
    for (const f of failed) {
      console.log(`  - ${f.flow}: ${f.error}`)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
