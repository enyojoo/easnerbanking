import { WALLET_ASSET_NETWORKS } from "@/lib/wallet-asset-networks"
import { isDirectTurnkeyCorridor } from "./routing"

export type WalletSendCorridor = {
  asset: string
  network: string
  enabled: boolean
  executionModel: "direct_turnkey" | "lifi_bridge"
  wave: "W1" | "W2" | "W3"
}

const W2_PAIRS = new Set([
  "USDT:Tron",
  "USDC:Base",
  "USDC:Ethereum",
])

const W1_PAIRS = new Set(["USDC:Solana", "EURC:Solana"])

/** Default enabled corridors for v1 (override via env WALLET_SEND_ENABLED_CORRIDORS). */
export function listWalletSendCorridors(): WalletSendCorridor[] {
  const envRaw = String(process.env.WALLET_SEND_ENABLED_CORRIDORS || "").trim()
  const envEnabled = envRaw
    ? new Set(envRaw.split(",").map((s) => s.trim()))
    : null

  const out: WalletSendCorridor[] = []
  for (const [asset, networks] of Object.entries(WALLET_ASSET_NETWORKS)) {
    for (const network of networks) {
      const key = `${asset}:${network}`
      let wave: WalletSendCorridor["wave"] = "W3"
      if (W1_PAIRS.has(key)) wave = "W1"
      else if (W2_PAIRS.has(key)) wave = "W2"

      const defaultEnabled = wave === "W1"
      const enabled = envEnabled ? envEnabled.has(key) : defaultEnabled

      out.push({
        asset,
        network,
        enabled,
        executionModel: isDirectTurnkeyCorridor(asset, network) ? "direct_turnkey" : "lifi_bridge",
        wave,
      })
    }
  }
  return out
}

export function isCorridorEnabled(asset: string, network: string): boolean {
  const key = `${String(asset).toUpperCase()}:${String(network).trim()}`
  return listWalletSendCorridors().some((c) => `${c.asset}:${c.network}` === key && c.enabled)
}
