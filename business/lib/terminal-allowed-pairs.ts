import { WALLET_ASSET_NETWORKS } from "@/lib/wallet-asset-networks"

/**
 * Merchant-facing deposit options for Stablecoin Terminal / QR Pay.
 * Built from the same asset×network catalog as Add recipient → Wallet address, plus optional sandbox pair.
 */
export type TerminalAllowedPair = {
  cryptoCurrency: string
  network: string
  label: string
}

function pairsFromWalletCatalog(): TerminalAllowedPair[] {
  const out: TerminalAllowedPair[] = []
  for (const [asset, networks] of Object.entries(WALLET_ASSET_NETWORKS)) {
    for (const network of networks) {
      out.push({
        cryptoCurrency: asset,
        network,
        label: `${asset} (${network})`,
      })
    }
  }
  return out
}

export const TERMINAL_ALLOWED_PAIRS: TerminalAllowedPair[] = [
  ...pairsFromWalletCatalog(),
  {
    cryptoCurrency: "USDC_TEST",
    network: "EthereumTestSepolia",
    label: "USDC (Sepolia testnet)",
  },
]

export function isAllowedTerminalPair(
  cryptoCurrency: string,
  network: string,
): TerminalAllowedPair | undefined {
  const c = cryptoCurrency.trim()
  const n = network.trim()
  return TERMINAL_ALLOWED_PAIRS.find(
    (p) => p.cryptoCurrency === c && p.network === n,
  )
}
