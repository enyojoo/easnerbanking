import { Connection, PublicKey } from "@solana/web3.js"
import { getAssociatedTokenAddressSync, unpackAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { getSolanaRpcUrl } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"

export type NestedAtaTrapInspection = {
  vaultAddress: string
  canonicalAta: string
  nestedAta: string
  nestedBalanceAtomic: bigint
  nestedBalanceHuman: number
  isNestedAtaTrap: boolean
  recoverableOnChain: boolean
  recoverableReason: string
}

/**
 * Relay mistakenly used the canonical SPL ATA as `recipient` instead of the vault pubkey.
 * Relay then funds a nested ATA whose owner is the ATA address – no signer exists.
 */
export async function inspectNestedAtaTrap(input: {
  vaultAddress: string
  nestedAta?: string | null
  asset?: "USDC" | "EURC"
  connection?: Connection
}): Promise<NestedAtaTrapInspection> {
  const asset = input.asset ?? "USDC"
  const vaultAddress = String(input.vaultAddress || "").trim()
  const canonicalAta = deriveStablecoinAssociatedTokenAddress(vaultAddress, asset) ?? ""
  const mintStr = mintForStablecoinAsset(asset)
  if (!mintStr || !canonicalAta) {
    throw new Error("invalid_vault_or_asset")
  }

  const conn = input.connection ?? new Connection(getSolanaRpcUrl(), "confirmed")
  const mint = new PublicKey(mintStr)
  const nestedDerived = getAssociatedTokenAddressSync(
    mint,
    new PublicKey(canonicalAta),
    true,
    TOKEN_PROGRAM_ID,
  ).toBase58()

  const nestedAta = String(input.nestedAta || nestedDerived).trim()
  const nestedInfo = await conn.getAccountInfo(new PublicKey(nestedAta))
  let nestedBalanceAtomic = BigInt(0)
  let nestedOwner = ""
  let delegate: string | null = null

  if (nestedInfo?.owner.equals(TOKEN_PROGRAM_ID)) {
    const acct = unpackAccount(new PublicKey(nestedAta), nestedInfo, TOKEN_PROGRAM_ID)
    nestedBalanceAtomic = acct.amount
    nestedOwner = acct.owner.toBase58()
    delegate = acct.delegate?.toBase58() ?? null
  }

  const isNestedAtaTrap = nestedOwner === canonicalAta && nestedAta === nestedDerived
  const recoverableOnChain =
    Boolean(delegate && delegate === vaultAddress) ||
    (nestedOwner === vaultAddress && nestedBalanceAtomic > BigInt(0))
  const recoverableReason = recoverableOnChain
    ? delegate
      ? "vault_is_delegate"
      : "vault_owns_source_account"
    : isNestedAtaTrap
      ? "nested_ata_owner_is_token_account_no_signer"
      : nestedOwner
        ? `unexpected_owner_${nestedOwner}`
        : "nested_account_missing"

  return {
    vaultAddress,
    canonicalAta,
    nestedAta,
    nestedBalanceAtomic,
    nestedBalanceHuman: Number(nestedBalanceAtomic) / 1_000_000,
    isNestedAtaTrap,
    recoverableOnChain,
    recoverableReason,
  }
}
