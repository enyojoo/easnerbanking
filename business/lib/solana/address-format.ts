import { PublicKey } from "@solana/web3.js"
import {
  isValidSolanaAddressFormat,
  normalizeSolanaAddress,
  validateWalletAddressForNetwork,
  type WalletAddressValidation,
} from "@easner/shared/solana/address-format"

export {
  isValidSolanaAddressFormat,
  normalizeSolanaAddress,
  validateWalletAddressForNetwork,
  type WalletAddressValidation,
}

/** Stricter Solana check (on-curve pubkey) for server paths. */
export function isValidSolanaPublicKey(input: string): boolean {
  if (!isValidSolanaAddressFormat(input)) return false
  try {
    new PublicKey(normalizeSolanaAddress(input))
    return true
  } catch {
    return false
  }
}
