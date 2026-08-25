import { relayRateProbeTronAddress, resolveCryptoRatesProbeSolAddress } from "../lib/relay/config"
import {
  extractRelaySolanaUnsignedTx,
  resolveRelaySolanaUnsignedTxHexForTurnkey,
} from "../lib/relay/quote"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/relay/token-map"
import { quoteRelayWalletBridge } from "../lib/wallet-send/relay-wallet-quote"
import { resolveWalletSendExecutionModel } from "../lib/wallet-send/routing"

const from = resolveCryptoRatesProbeSolAddress()
if (!from) throw new Error("no omnibus")

const source = sourceSolVaultToken("USD")
const PROBE_TO_EVM = "0x0000000000000000000000000000000000000001"
const PROBE_TO_SOL = "11111111111111111111111111111112"

const corridors = [
  { asset: "USDC", network: "Ethereum" },
  { asset: "USDC", network: "Base" },
  { asset: "USDT", network: "Ethereum" },
  { asset: "USDT", network: "Tron" },
  { asset: "USDC", network: "Solana" },
]

async function main() {
  for (const c of corridors) {
    const model = resolveWalletSendExecutionModel(c.asset, c.network)
    const dest = resolveWalletSendToken(c.asset, c.network)
    const to =
      c.network === "Solana"
        ? PROBE_TO_SOL
        : c.network === "Tron"
          ? relayRateProbeTronAddress()
          : PROBE_TO_EVM
    const row: Record<string, unknown> = {
      corridor: `${c.asset}/${c.network}`,
      executionModel: model,
    }

    if (model === "direct_turnkey") {
      console.log(JSON.stringify({ ...row, relay: "n/a (direct Turnkey SPL send)" }))
      continue
    }
    if (!dest) {
      console.log(JSON.stringify({ ...row, error: "unsupported_corridor" }))
      continue
    }

    try {
      const quote = await quoteRelayWalletBridge({
        source,
        dest,
        fromAddress: from,
        toAddress: to,
        amountEntryMode: "receive",
        receiveAmount: 10,
        customerRate: 1,
        bridgeMid: 1,
      })
      const data = quote.steps?.[0]?.items?.[0]?.data
      const dataKeys = data && typeof data === "object" ? Object.keys(data) : []
      let legacyOk = false
      let compileOk = false
      let compileErr = ""
      try {
        extractRelaySolanaUnsignedTx(quote)
        legacyOk = true
      } catch {
        /* expected for instruction steps */
      }
      try {
        await resolveRelaySolanaUnsignedTxHexForTurnkey({ quote, feePayer: from })
        compileOk = true
      } catch (e) {
        compileErr = e instanceof Error ? e.message : String(e)
      }
      console.log(
        JSON.stringify({
          ...row,
          dataKeys,
          legacyOk,
          compileOk,
          compileErr: compileErr || null,
        }),
      )
    } catch (e) {
      console.log(JSON.stringify({ ...row, quoteError: e instanceof Error ? e.message : String(e) }))
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
