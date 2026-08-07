/**
 * Minimal Relay API smoke test (auth + quote + request lookup).
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/probe-relay-health.ts
 */
import { relayGetRequestV3 } from "../lib/relay/client"
import { isRelayConfigured, resolveCryptoRatesProbeSolAddress } from "../lib/relay/config"
import { extractRelayRequestId, parseRelayFromAmountRaw } from "../lib/relay/quote"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/relay/token-map"
import { quoteRelayWalletBridge } from "../lib/wallet-send/relay-wallet-quote"

async function main() {
  if (!isRelayConfigured()) throw new Error("RELAY_API_KEY not set")
  const from = resolveCryptoRatesProbeSolAddress()
  if (!from) throw new Error("DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD not set")

  const source = sourceSolVaultToken("USD")
  const dest = resolveWalletSendToken("USDC", "Base")
  if (!dest) throw new Error("USDC/Base token mapping missing")

  console.log("probe from:", from)
  const quote = await quoteRelayWalletBridge({
    source,
    dest,
    fromAddress: from,
    toAddress: "0x0000000000000000000000000000000000000001",
    amountEntryMode: "receive",
    receiveAmount: 10,
    customerRate: 1,
    bridgeMid: 1,
  })

  const requestId = extractRelayRequestId(quote)
  console.log("quote OK:", {
    requestId,
    fromRaw: parseRelayFromAmountRaw(quote),
  })

  if (requestId) {
    const req = await relayGetRequestV3(requestId)
    console.log("request lookup:", req ? { status: req.status } : "not found")
  }

  console.log("\nRelay API is reachable and authenticated.")
}

main().catch((e) => {
  console.error("Relay health check failed:", e instanceof Error ? e.message : e)
  process.exit(1)
})
