import { PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"

/**
 * SPL ATA for owner + stablecoin asset (USDC/EURC mainnet mints).
 */
export function deriveStablecoinAssociatedTokenAddress(ownerAddress: string, asset: string): string | null {
  const mintStr = mintForStablecoinAsset(asset)
  if (!mintStr) return null
  try {
    const mint = new PublicKey(mintStr)
    const owner = new PublicKey(ownerAddress.trim())
    return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID).toBase58()
  } catch {
    return null
  }
}
