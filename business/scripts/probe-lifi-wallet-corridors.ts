/**
 * Probe LI.FI wallet-send corridors for v1 catalog.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/probe-lifi-wallet-corridors.ts
 */
import { listWalletSendCorridors } from "../lib/wallet-send/corridors"
import { isDirectTurnkeyCorridor } from "../lib/wallet-send/routing"
import { lifiQuote } from "../lib/lifi/client"
import { resolveWalletSendToken, sourceSolVaultToken } from "../lib/lifi/token-map"

const PROBE_FROM = process.env.CRYPTO_RATES_PROBE_SOL_ADDRESS || ""
const PROBE_TO_TRON = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"
const PROBE_TO_EVM = "0x0000000000000000000000000000000000000001"
const PROBE_TO_SOL = "11111111111111111111111111111112"

function dummyTo(asset: string, network: string): string {
  if (network === "Tron") return PROBE_TO_TRON
  if (network === "Solana") return PROBE_TO_SOL
  return PROBE_TO_EVM
}

async function main() {
  const corridors = listWalletSendCorridors()
  console.log("Wallet send corridor probe\n")

  for (const c of corridors) {
    if (isDirectTurnkeyCorridor(c.asset, c.network)) {
      console.log(`${c.asset}:${c.network} — direct_turnkey (${c.wave}) — skip LI.FI probe`)
      continue
    }

    if (!PROBE_FROM) {
      console.log(`${c.asset}:${c.network} — skip (CRYPTO_RATES_PROBE_SOL_ADDRESS unset)`)
      continue
    }

    try {
      const source = sourceSolVaultToken("USD")
      const dest = resolveWalletSendToken(c.asset, c.network)
      if (!dest) {
        console.log(`${c.asset}:${c.network} — FAIL token map`)
        continue
      }
      const quote = await lifiQuote({
        fromChain: source.chainId,
        toChain: dest.chainId,
        fromToken: source.address,
        toToken: dest.address,
        fromAddress: PROBE_FROM,
        toAddress: dummyTo(c.asset, c.network),
        fromAmount: "100000000",
        fee: 0,
      })
      const toAmt = Number(quote.estimate?.toAmount ?? 0) / 10 ** dest.decimals
      console.log(`${c.asset}:${c.network} — OK tool=${quote.tool ?? "?"} to≈${toAmt.toFixed(4)} (${c.wave})`)
    } catch (e) {
      console.log(
        `${c.asset}:${c.network} — FAIL ${e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)}`,
      )
    }
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
