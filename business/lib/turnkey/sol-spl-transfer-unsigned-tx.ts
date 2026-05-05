import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { createTransferCheckedInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"

export function getSolanaRpcUrl(): string {
  return (process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim()
}

/**
 * Builds a legacy, single-instruction SPL `TransferChecked` (6 decimals) for USDC/EURC,
 * serialized for Turnkey `solSendTransaction`.
 *
 * Turnkey's API decodes `unsignedTransaction` as **hex-encoded wire bytes** (Go `encoding/hex`);
 * some docs still say "base64" but production rejects base64 (e.g. invalid hex byte `Q`).
 *
 * Sponsored flows: Turnkey requires the System Program in static account keys; we prepend a
 * no-op 0-lamport self-transfer so parsing/sponsorship succeeds.
 *
 * @see https://docs.turnkey.com/networks/solana-transaction-construction
 */
export async function buildStablecoinSplTransferUnsignedTxPayloadForTurnkey(input: {
  asset: "USDC" | "EURC"
  /** Vault wallet pubkey (Turnkey `signWith` must match this). */
  ownerAddress: string
  /** Payee wallet or ATA depending on `destinationIsTokenAccount`. */
  destinationAddress: string
  destinationIsTokenAccount: boolean
  amountHuman: number
  /** When true, prepend a System Program ix (Turnkey sponsored Solana constraint). */
  sponsoredFlow: boolean
  /**
   * When set, use this blockhash instead of fetching RPC here (keeps wire hash aligned with
   * `recentBlockhash` passed to Turnkey `solSendTransaction`, reducing expiry skew).
   */
  recentBlockhash?: string
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

  const transferIx = createTransferCheckedInstruction(
    sourceAta,
    mint,
    destAta,
    owner,
    amountAtomic,
    6,
    [],
    TOKEN_PROGRAM_ID,
  )

  const blockhash =
    String(input.recentBlockhash || "").trim() ||
    (await new Connection(getSolanaRpcUrl(), "confirmed").getLatestBlockhash("finalized")).blockhash

  const tx = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash,
  })

  if (input.sponsoredFlow) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: owner,
        lamports: 0,
      }),
    )
  }
  tx.add(transferIx)

  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  })
  return Buffer.from(serialized).toString("hex")
}
