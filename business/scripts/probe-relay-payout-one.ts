import { resolveCryptoRatesProbeSolAddress } from "../lib/relay/config"
import { extractRelayRequestId, parseRelayFromAmountRaw, parseRelayToAmountHuman } from "../lib/relay/quote"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/relay/token-map"
import { quoteRelayWalletBridge } from "../lib/wallet-send/relay-wallet-quote"

const asset = process.argv[2] || "USDT"
const network = process.argv[3] || "Tron"
const PROBE_TO_TRON = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"
const PROBE_TO_EVM = "0x0000000000000000000000000000000000000001"
const PROBE_TO_SOL = "11111111111111111111111111111112"

const from = resolveCryptoRatesProbeSolAddress()
if (!from) throw new Error("no omnibus")
const source = sourceSolVaultToken("USD")
const dest = resolveWalletSendToken(asset, network)
if (!dest) throw new Error("bad corridor")
const to = network === "Tron" ? PROBE_TO_TRON : network === "Solana" ? PROBE_TO_SOL : PROBE_TO_EVM

async function main() {
  const quote = await quoteRelayWalletBridge({
    source,
    dest,
    fromAddress: from,
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

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
