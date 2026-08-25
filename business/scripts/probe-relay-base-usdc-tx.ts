import { resolveCryptoRatesProbeSolAddress } from "../lib/relay/config"
import {
  extractRelayRequestId,
  extractRelaySolanaUnsignedTx,
  parseRelayFromAmountRaw,
  resolveRelaySolanaUnsignedTxHexForTurnkey,
} from "../lib/relay/quote"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/relay/token-map"
import { quoteRelayWalletBridge } from "../lib/wallet-send/relay-wallet-quote"

const from = resolveCryptoRatesProbeSolAddress()
if (!from) throw new Error("no omnibus")
const source = sourceSolVaultToken("USD")
const dest = resolveWalletSendToken("USDC", "Base")
if (!dest) throw new Error("bad corridor")
const to = process.argv[2] || "0x61f74a0000000000000000000000000000000065bb4a"

async function inspect(receiveAmount: number) {
  const quote = await quoteRelayWalletBridge({
    source,
    dest,
    fromAddress: from,
    toAddress: to,
    amountEntryMode: "receive",
    receiveAmount,
    customerRate: 1,
    bridgeMid: 1,
  })
  const steps = quote.steps ?? []
  const items = steps.flatMap((s) => s.items ?? [])
  const dataSamples = items.map((i) => ({
    status: i.status,
    dataKeys: i.data && typeof i.data === "object" ? Object.keys(i.data) : [],
    check: i.check,
  }))
  let txPreview: string | null = null
  let txError: string | null = null
  let compiledPreview: string | null = null
  let compiledError: string | null = null
  try {
    txPreview = extractRelaySolanaUnsignedTx(quote).slice(0, 48)
  } catch (e) {
    txError = e instanceof Error ? e.message : String(e)
  }
  try {
    compiledPreview = (
      await resolveRelaySolanaUnsignedTxHexForTurnkey({ quote, feePayer: from })
    ).slice(0, 48)
  } catch (e) {
    compiledError = e instanceof Error ? e.message : String(e)
  }
  console.log(
    JSON.stringify(
      {
        receiveAmount,
        requestId: extractRelayRequestId(quote),
        fromRaw: parseRelayFromAmountRaw(quote),
        stepKinds: steps.map((s) => ({
          id: s.id,
          kind: (s as { kind?: string }).kind,
          itemCount: s.items?.length ?? 0,
        })),
        dataSamples,
        txPreview,
        txError,
        compiledPreview,
        compiledError,
      },
      null,
      2,
    ),
  )
}

async function dumpRaw() {
  const { relayQuoteV2 } = await import("../lib/relay/client")
  const { relayQuoteFeeParams } = await import("../lib/relay/config")
  const quote = await relayQuoteV2({
    user: from,
    recipient: to,
    originChainId: source.chainId,
    destinationChainId: dest!.chainId,
    originCurrency: source.address,
    destinationCurrency: dest!.address,
    amount: "10000000",
    tradeType: "EXACT_INPUT",
    slippageTolerance: "300",
    ...relayQuoteFeeParams(),
  })
  const data = quote.steps?.[0]?.items?.[0]?.data
  console.log("RAW_DATA", JSON.stringify(data, null, 2).slice(0, 12000))
}

async function main() {
  if (process.argv.includes("--dump")) {
    await dumpRaw()
    return
  }
  await inspect(10)
  await inspect(4435)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
