/**
 * Probe Relay wallet-send pricing + poll GET /requests/v3.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-relay-wallet-send-pricing.ts
 */
import { relayGetRequestV3 } from "../lib/relay/client"
import { resolveCryptoRatesProbeSolAddress } from "../lib/relay/config"
import { extractRelayRequestId, parseRelayFromAmountRaw, parseRelayToAmountHuman } from "../lib/relay/quote"
import { mapRelayRequestStatusV3, parseRelayFeesV3 } from "../lib/relay/requests-v3"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/relay/token-map"
import { quoteRelayWalletBridge } from "../lib/wallet-send/relay-wallet-quote"

const PROBE_FROM = resolveCryptoRatesProbeSolAddress() || ""
const RECEIVE = Number(process.env.RECEIVE_AMOUNT || "100")
const PROBE_TO_TRON = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
const PROBE_TO_EVM = "0x0000000000000000000000000000000000000001"

function dummyTo(network: string): string {
  if (network === "Tron") return PROBE_TO_TRON
  return PROBE_TO_EVM
}

async function main() {
  if (!isRelayConfigured()) throw new Error("RELAY_API_KEY not set")
  if (!PROBE_FROM) throw new Error("Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD")

  const corridors = [
    { asset: "USDC", network: "Base" },
    { asset: "USDC", network: "Ethereum" },
    { asset: "USDT", network: "Tron" },
  ] as const

  for (const c of corridors) {
    const source = sourceSolVaultToken("USD")
    const dest = resolveWalletSendToken(c.asset, c.network)
    if (!dest) continue

    console.log(`\n=== ${c.asset}/${c.network} EXACT_OUTPUT ${RECEIVE} ===`)
    const quote = await quoteRelayWalletBridge({
      source,
      dest,
      fromAddress: PROBE_FROM,
      toAddress: dummyTo(c.network),
      amountEntryMode: "receive",
      receiveAmount: RECEIVE,
      customerRate: 1,
      bridgeMid: 1,
    })

    const fromRaw = parseRelayFromAmountRaw(quote)
    const toHuman = parseRelayToAmountHuman(quote, dest.decimals)
    const requestId = extractRelayRequestId(quote)
    console.log({ fromRaw, toHuman, requestId })

    if (requestId) {
      const req = await relayGetRequestV3(requestId)
      if (req) {
        console.log({
          status: req.status,
          mapped: mapRelayRequestStatusV3(String(req.status)),
          fees: parseRelayFeesV3(req),
        })
      }
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
