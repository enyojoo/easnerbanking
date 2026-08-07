/** Static wallet-send corridor icons (no external LI.FI dependency). */

export type WalletSendIconManifest = {
  tokens: Record<string, string>
  networks: Record<string, string>
  updatedAt: string
}

const STATIC_TOKENS: Record<string, string> = {
  "USDC:Solana":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  "USDC:Ethereum":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  "USDC:Base":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png",
  "USDT:Solana":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
  "USDT:Ethereum":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  "USDT:Base":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0xfde4C96c8590BB5BA8c193842FF767abDA5Eba29/logo.png",
  "USDT:Tron":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/assets/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/logo.png",
  "EURC:Solana":
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr/logo.png",
}

const STATIC_NETWORKS: Record<string, string> = {
  Solana:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  Ethereum:
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  Base: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  Tron: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png",
}

export async function getWalletSendIconManifest(_force = false): Promise<WalletSendIconManifest> {
  return {
    tokens: { ...STATIC_TOKENS },
    networks: { ...STATIC_NETWORKS },
    updatedAt: new Date().toISOString(),
  }
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
