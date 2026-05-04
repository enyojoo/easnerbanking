import { Connection, PublicKey, Transaction } from "@solana/web3.js"
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"

function getSolanaRpcUrl(): string {
  return (process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim()
}

/**
 * Builds a legacy, single-instruction SPL `TransferChecked` (6 decimals) for USDC/EURC,
 * serialized for Turnkey `solSendTransaction` (`unsignedTransaction` is base64 of wire bytes).
 */
export async function buildStablecoinSplTransferUnsignedTxBase64(input: {
  asset: "USDC" | "EURC"
  /** Vault wallet pubkey (Turnkey `signWith` must match this). */
  ownerAddress: string
  /** Payee wallet or ATA depending on `destinationIsTokenAccount`. */
  destinationAddress: string
  destinationIsTokenAccount: boolean
  amountHuman: number
}): Promise<string> {
  const mintStr = mintForStablecoinAsset(input.asset)
  if (!mintStr) throw new Error("Unsupported asset for Solana SPL transfer")

  const mint = new PublicKey(mintStr)
  const owner = new PublicKey(String(input.ownerAddress || "").trim())
  const dest = new PublicKey(String(input.destinationAddress || "").trim())

  const sourceAta = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID)
  const destAta = input.destinationIsTokenAccount
    ? dest
    : getAssociatedTokenAddressSync(mint, dest, false, TOKEN_PROGRAM_ID)

  const amountAtomic = BigInt(Math.round(input.amountHuman * 1_000_000))
  if (amountAtomic <= BigInt(0)) throw new Error("amount must be positive")

  const ix = createTransferCheckedInstruction(
    sourceAta,
    mint,
    destAta,
    owner,
    amountAtomic,
    6,
    [],
    TOKEN_PROGRAM_ID,
  )

  const connection = new Connection(getSolanaRpcUrl(), "confirmed")
  const { blockhash } = await connection.getLatestBlockhash("confirmed")

  const tx = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash,
  }).add(ix)

  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  })
  return Buffer.from(serialized).toString("base64")
}
