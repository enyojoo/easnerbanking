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
export type StablecoinAtaBalanceRead = {
  USD: number
  EUR: number
  /**
   * False when we had wallet accounts to read but every RPC balance lookup failed.
   * Callers must not overwrite `wallet_balances` when this is false – doing so
   * would flash $0.00 until a later Turnkey/ATA sync recovers.
   */
  readOk: boolean
}

export async function fetchStablecoinBalancesFromAta(
  accounts: SolanaWalletAccountRow[],
  connection?: Connection,
): Promise<StablecoinAtaBalanceRead> {
  const conn = connection ?? createSolanaRpcConnection()
  let usd = 0
  let eur = 0
  let readAttempts = 0
  let readSuccesses = 0

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
      readAttempts += 1
      const bal = await conn.getTokenAccountBalance(new PublicKey(ata))
      readSuccesses += 1
      const ui = Number(bal.value.uiAmount ?? 0)
      if (!Number.isFinite(ui) || ui <= 0) continue
      if (asset === "USDC") usd += ui
      else eur += ui
    } catch {
      // Missing ATA or RPC failure – do not count as a successful read.
    }
  }

  const readOk = readAttempts === 0 || readSuccesses > 0
  return { USD: usd, EUR: eur, readOk }
}
