/** Retry specific Relay flows that hit 429 in batch runs. */
import { relayQuote } from "../lib/relay/quote"
import {
  extractRelayDepositAddress,
  extractRelayRequestId,
  parseRelayFromAmountRaw,
  parseRelayToAmountHuman,
} from "../lib/relay/quote"
import { resolveCryptoRatesProbeSolAddress } from "../lib/relay/config"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/relay/token-map"
import { quoteRelayWalletBridge } from "../lib/wallet-send/relay-wallet-quote"

const PROBE_FROM = resolveCryptoRatesProbeSolAddress() || ""
const PROBE_VAULT = PROBE_FROM
const PROBE_TO_TRON = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"
const PROBE_TO_EVM = "0x0000000000000000000000000000000000000001"
const PROBE_TO_SOL = "11111111111111111111111111111112"

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

async function payout(asset: string, network: string) {
  const source = sourceSolVaultToken("USD")
  const dest = resolveWalletSendToken(asset, network)
  if (!dest) throw new Error("token map")
  const to = network === "Tron" ? PROBE_TO_TRON : network === "Solana" ? PROBE_TO_SOL : PROBE_TO_EVM
  const quote = await quoteRelayWalletBridge({
    source,
    dest,
    fromAddress: PROBE_FROM,
    toAddress: to,
    amountEntryMode: "receive",
    receiveAmount: 100,
    customerRate: 1,
    bridgeMid: 1,
  })
  console.log(`payout ${asset}/${network}`, {
    requestId: extractRelayRequestId(quote),
    fromRaw: parseRelayFromAmountRaw(quote),
    toHuman: parseRelayToAmountHuman(quote, dest.decimals),
  })
}

async function payIn() {
  const source = resolveWalletSendToken("USDT", "Tron")
  const dest = sourceSolVaultToken("USD")
  const quote = await relayQuote({
    user: PROBE_TO_TRON,
    recipient: PROBE_VAULT,
    source,
    dest,
    amountRaw: "1000000",
    tradeType: "EXACT_INPUT",
    useDepositAddress: true,
    refundTo: PROBE_TO_TRON,
  })
  const tronAddress = extractRelayDepositAddress(quote)
  console.log("pay-in USDT/Tron", {
    tronDepositAddress: tronAddress,
    requestId: extractRelayRequestId(quote),
  })
}

async function main() {
  await payIn()
  await sleep(12000)
  for (const [asset, network] of [
    ["USDC", "Base"],
    ["USDT", "Tron"],
    ["USDT", "Solana"],
  ] as const) {
    await payout(asset, network)
    await sleep(12000)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
