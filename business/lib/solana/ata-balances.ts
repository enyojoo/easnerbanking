import { PublicKey } from "@solana/web3.js"
import type { Connection } from "@solana/web3.js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"

export type SolanaWalletAccountRow = {
  address: string
  asset: string
  associated_token_account_address?: string | null
}

/**
 * Sum USDC/EURC balances from SPL associated token accounts (chain truth).
 */
export async function fetchStablecoinBalancesFromAta(
  accounts: SolanaWalletAccountRow[],
  connection?: Connection,
): Promise<{ USD: number; EUR: number }> {
  const conn = connection ?? createSolanaRpcConnection()
  let usd = 0
  let eur = 0

  for (const row of accounts) {
    const asset = String(row.asset || "")
      .trim()
      .toUpperCase()
    if (asset !== "USDC" && asset !== "EURC") continue

    const owner = String(row.address || "").trim()
    if (!owner) continue

    const ata =
      String(row.associated_token_account_address || "").trim() ||
      deriveStablecoinAssociatedTokenAddress(owner, asset) ||
      ""
    if (!ata) continue

    try {
      const bal = await conn.getTokenAccountBalance(new PublicKey(ata))
      const ui = Number(bal.value.uiAmount ?? 0)
      if (!Number.isFinite(ui) || ui <= 0) continue
      if (asset === "USDC") usd += ui
      else eur += ui
    } catch {
      // Missing ATA or zero balance — treat as 0 for that account.
    }
  }

  return { USD: usd, EUR: eur }
}
