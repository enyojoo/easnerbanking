import { WALLET_ASSET_NETWORKS } from "@/lib/wallet-asset-networks"
import { isDirectTurnkeyCorridor } from "./routing"

export type WalletSendCorridor = {
  asset: string
  network: string
  enabled: boolean
  executionModel: "direct_turnkey" | "relay_bridge"
}

/**
 * All v1 catalog pairs are enabled by default.
 * Optional `WALLET_SEND_ENABLED_CORRIDORS` restricts to an explicit allowlist (comma-separated `ASSET:Network`).
 */
export function listWalletSendCorridors(): WalletSendCorridor[] {
  const envRaw = String(process.env.WALLET_SEND_ENABLED_CORRIDORS || "").trim()
  const envAllowlist = envRaw
    ? new Set(envRaw.split(",").map((s) => s.trim()).filter(Boolean))
    : null

  const out: WalletSendCorridor[] = []
  for (const [asset, networks] of Object.entries(WALLET_ASSET_NETWORKS)) {
    for (const network of networks) {
      const key = `${asset}:${network}`
      const enabled = envAllowlist ? envAllowlist.has(key) : true

      out.push({
        asset,
        network,
        enabled,
        executionModel: isDirectTurnkeyCorridor(asset, network) ? "direct_turnkey" : "relay_bridge",
      })
    }
  }
  return out
}

export function isCorridorEnabled(asset: string, network: string): boolean {
  const key = `${String(asset).toUpperCase()}:${String(network).trim()}`
  return listWalletSendCorridors().some((c) => `${c.asset}:${c.network}` === key && c.enabled)
}
