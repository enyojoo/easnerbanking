import { Connection, PublicKey } from "@solana/web3.js"
import { unpackAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { getSolanaRpcUrl } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"

export type SplTokenAccountVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "wrong_owner" | "wrong_mint" | "invalid_mint" }

/**
 * Confirms an SPL token account exists on-chain and is owned by `expectedOwnerVault` for the asset mint.
 */
export async function verifyStablecoinTokenAccount(
  tokenAccountAddress: string,
  expectedOwnerVault: string,
  asset: "USDC" | "EURC",
  connection?: Connection,
): Promise<SplTokenAccountVerifyResult> {
  const mintStr = mintForStablecoinAsset(asset)
  if (!mintStr) return { ok: false, reason: "invalid_mint" }

  const conn = connection ?? new Connection(getSolanaRpcUrl(), "confirmed")
  let tokenPk: PublicKey
  let ownerPk: PublicKey
  try {
    tokenPk = new PublicKey(String(tokenAccountAddress || "").trim())
    ownerPk = new PublicKey(String(expectedOwnerVault || "").trim())
  } catch {
    return { ok: false, reason: "missing" }
  }

  const info = await conn.getAccountInfo(tokenPk)
  if (!info || !info.owner.equals(TOKEN_PROGRAM_ID)) {
    return { ok: false, reason: "missing" }
  }

  try {
    const acct = unpackAccount(tokenPk, info, TOKEN_PROGRAM_ID)
    if (!acct.owner.equals(ownerPk)) return { ok: false, reason: "wrong_owner" }
    if (acct.mint.toBase58() !== mintStr) return { ok: false, reason: "wrong_mint" }
    return { ok: true }
  } catch {
    return { ok: false, reason: "missing" }
  }
}
