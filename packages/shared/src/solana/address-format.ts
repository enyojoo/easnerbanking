/** Base58 alphabet used by Solana (no 0, O, I, l). */
const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function normalizeSolanaAddress(input: string): string {
  return input.trim().replace(/\s/g, "")
}

/** Format check only (no on-curve verification). Catches EVM/Tron addresses pasted on Solana. */
export function isValidSolanaAddressFormat(input: string): boolean {
  const n = normalizeSolanaAddress(input)
  return SOLANA_BASE58_RE.test(n)
}

export type WalletAddressValidation = { isValid: boolean; error?: string }

/**
 * Client-side wallet address checks by Noah / recipient network id.
 * @see business/lib/wallet-asset-networks.ts
 */
export function validateWalletAddressForNetwork(
  address: string,
  network: string,
): WalletAddressValidation {
  const trimmed = address.trim()
  if (!trimmed) {
    return { isValid: false, error: "Wallet address is required" }
  }

  const net = network.trim()
  if (net === "Solana" || net === "SOL") {
    if (!isValidSolanaAddressFormat(trimmed)) {
      return {
        isValid: false,
        error: "Enter a valid Solana address (base58, 32–44 characters)",
      }
    }
    return { isValid: true }
  }

  const evmNetworks = new Set([
    "Ethereum",
    "Base",
    "PolygonPos",
    "Gnosis",
    "Celo",
    "FlowEvm",
  ])
  if (evmNetworks.has(net)) {
    const evm = trimmed.replace(/\s/g, "")
    if (!/^0x[a-fA-F0-9]{40}$/.test(evm)) {
      return {
        isValid: false,
        error: "Enter a valid EVM address (0x followed by 40 hex characters)",
      }
    }
    return { isValid: true }
  }

  if (net === "Tron") {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed.replace(/\s/g, ""))) {
      return {
        isValid: false,
        error: "Enter a valid Tron address (starts with T)",
      }
    }
    return { isValid: true }
  }

  if (net === "Bitcoin") {
    const btc = trimmed.replace(/\s/g, "")
    if (btc.length < 26 || btc.length > 90) {
      return { isValid: false, error: "Enter a valid Bitcoin address" }
    }
    return { isValid: true }
  }

  if (trimmed.length < 16) {
    return { isValid: false, error: "Wallet address looks too short" }
  }
  return { isValid: true }
}
