import { lifiFetchChains, lifiFetchTokens } from "./client"
import { lifiChainForNoahNetwork } from "./chain-map"
import { resolveWalletSendToken } from "./token-map"
import { V1_WALLET_SEND_ASSETS, WALLET_ASSET_NETWORKS } from "@/lib/wallet-asset-networks"

export type WalletSendIconManifest = {
  tokens: Record<string, string>
  networks: Record<string, string>
  updatedAt: string
}

let cachedManifest: WalletSendIconManifest | null = null
let cachedAtMs = 0
const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000

export async function getWalletSendIconManifest(force = false): Promise<WalletSendIconManifest> {
  if (!force && cachedManifest && Date.now() - cachedAtMs < MANIFEST_TTL_MS) {
    return cachedManifest
  }

  const tokens: Record<string, string> = {}
  const networks: Record<string, string> = {}

  try {
    const chains = await lifiFetchChains()
    for (const c of chains) {
      const network = Object.entries(WALLET_ASSET_NETWORKS)
        .flatMap(([_, nets]) => nets)
        .find((n) => {
          const meta = lifiChainForNoahNetwork(n)
          return meta && String(meta.chainId) === String(c.id)
        })
      if (network && c.logoURI) networks[network] = c.logoURI
    }

    const chainIds = [...new Set(Object.values(WALLET_ASSET_NETWORKS).flat())]
      .map((n) => lifiChainForNoahNetwork(n)?.chainId)
      .filter((x): x is number | string => x != null)
    const tokenRows = await lifiFetchTokens(chainIds)
    for (const asset of V1_WALLET_SEND_ASSETS) {
      for (const network of WALLET_ASSET_NETWORKS[asset] ?? []) {
        const ref = resolveWalletSendToken(asset, network)
        if (!ref) continue
        const row = tokenRows.find(
          (t) =>
            String(t.chainId) === String(ref.chainId) &&
            t.address.toLowerCase() === ref.address.toLowerCase(),
        )
        if (row?.logoURI) tokens[`${asset}:${network}`] = row.logoURI
      }
    }
  } catch {
    // Best-effort; callers fall back to static icons.
  }

  cachedManifest = { tokens, networks, updatedAt: new Date().toISOString() }
  cachedAtMs = Date.now()
  return cachedManifest
}

export function tokenIconFromManifest(
  manifest: WalletSendIconManifest,
  asset: string,
  network: string,
): string | undefined {
  return manifest.tokens[`${asset.toUpperCase()}:${network}`]
}

export function networkIconFromManifest(
  manifest: WalletSendIconManifest,
  network: string,
): string | undefined {
  return manifest.networks[network]
}
