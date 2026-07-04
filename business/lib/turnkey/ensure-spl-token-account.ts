import type { SupabaseClient } from "@supabase/supabase-js"
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { verifyStablecoinTokenAccount } from "@/lib/solana/verify-token-account"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import {
  getTurnkeySolanaBroadcastCaip2,
  isTurnkeySolSponsorshipEnabled,
} from "@/lib/turnkey/config"
import { getSolanaRpcUrl } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"
import {
  interpretTurnkeyGetSendTransactionStatus,
  pollUntilTurnkeySendTerminal,
  resolveSolSendParsedIds,
} from "@/lib/turnkey/sol-send-polling"

type TurnkeyClientLike = Record<string, (...args: any[]) => Promise<any>>

function buildCreateAtaUnsignedTxHex(input: {
  vaultAddress: string
  ataAddress: string
  asset: "USDC" | "EURC"
  sponsoredFlow: boolean
  recentBlockhash: string
}): string {
  const mintStr = mintForStablecoinAsset(input.asset)
  if (!mintStr) throw new Error("Unsupported asset for ATA creation")

  const owner = new PublicKey(input.vaultAddress)
  const ata = new PublicKey(input.ataAddress)
  const mint = new PublicKey(mintStr)

  const tx = new Transaction({
    feePayer: owner,
    recentBlockhash: input.recentBlockhash,
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
  tx.add(
    createAssociatedTokenAccountInstruction(owner, ata, owner, mint, TOKEN_PROGRAM_ID),
  )

  return Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("hex")
}

/**
 * Creates the canonical USDC/EURC ATA on Solana when missing.
 * Required before showing ATA as a deposit address — otherwise bridges may treat the ATA
 * pubkey as a wallet owner and fund a nested token account Turnkey cannot sign.
 */
export async function ensureStablecoinTokenAccountOnChain(input: {
  subOrgId: string
  vaultAddress: string
  asset: "USDC" | "EURC"
  /** When set, must match derived ATA for vault+asset. */
  expectedAta?: string | null
}): Promise<{ ok: true; ata: string; created: boolean } | { ok: false; error: string }> {
  const vault = String(input.vaultAddress || "").trim()
  const subOrgId = String(input.subOrgId || "").trim()
  if (!vault || !subOrgId) return { ok: false, error: "vault_and_sub_org_required" }

  const derivedAta = deriveStablecoinAssociatedTokenAddress(vault, input.asset)
  if (!derivedAta) return { ok: false, error: "ata_derivation_failed" }

  const ata = String(input.expectedAta || derivedAta).trim()
  if (ata !== derivedAta) {
    return { ok: false, error: "ata_mismatch_derived" }
  }

  const conn = new Connection(getSolanaRpcUrl(), "confirmed")
  const verified = await verifyStablecoinTokenAccount(ata, vault, input.asset, conn)
  if (verified.ok) return { ok: true, ata, created: false }

  const client = getTurnkeyApiClientForSubOrganization(subOrgId) as TurnkeyClientLike | null
  if (!client || typeof client.solSendTransaction !== "function") {
    return { ok: false, error: "turnkey_client_unavailable" }
  }

  const sponsor = isTurnkeySolSponsorshipEnabled()
  const caip2 = getTurnkeySolanaBroadcastCaip2()
  const { blockhash } = await conn.getLatestBlockhash("finalized")
  const unsignedTransaction = buildCreateAtaUnsignedTxHex({
    vaultAddress: vault,
    ataAddress: ata,
    asset: input.asset,
    sponsoredFlow: sponsor,
    recentBlockhash: blockhash,
  })

  let sendRes: unknown
  try {
    sendRes = await client.solSendTransaction({
      organizationId: subOrgId,
      unsignedTransaction,
      signWith: vault,
      caip2,
      ...(sponsor ? { sponsor: true, recentBlockhash: blockhash } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg.slice(0, 500) }
  }

  const parsed = await resolveSolSendParsedIds(client, subOrgId, (sendRes || {}) as Record<string, unknown>)
  if (typeof client.getSendTransactionStatus === "function") {
    const last = await pollUntilTurnkeySendTerminal(client, subOrgId, parsed.providerTransactionId, {
      timeoutMs: 90_000,
      intervalMs: 500,
    })
    const terminal = interpretTurnkeyGetSendTransactionStatus(last)
    if (terminal.status === "failed") {
      return { ok: false, error: "ata_creation_broadcast_failed" }
    }
  }

  const after = await verifyStablecoinTokenAccount(ata, vault, input.asset, conn)
  if (!after.ok) return { ok: false, error: `ata_still_${after.reason}` }

  return { ok: true, ata, created: true }
}

export async function ensureWalletAccountAtaForOwner(
  admin: SupabaseClient,
  walletAccountId: string,
): Promise<{ ok: true; ata: string } | { ok: false; error: string }> {
  const { data: row, error } = await admin
    .from("wallet_accounts")
    .select(
      "id, address, asset, chain, associated_token_account_address, turnkey_sub_organization_id, wallet_owner_id",
    )
    .eq("id", walletAccountId)
    .maybeSingle()
  if (error || !row?.id) return { ok: false, error: error?.message || "wallet_account_not_found" }
  if (String(row.chain) !== "solana") return { ok: false, error: "not_solana" }

  const asset = String(row.asset || "").toUpperCase()
  if (asset !== "USDC" && asset !== "EURC") return { ok: false, error: "unsupported_asset" }

  let subOrgId = String(row.turnkey_sub_organization_id || "").trim()
  if (!subOrgId) {
    const { data: owner } = await admin
      .from("wallet_owners")
      .select("turnkey_sub_organization_id")
      .eq("id", row.wallet_owner_id)
      .maybeSingle()
    subOrgId = String(owner?.turnkey_sub_organization_id || "").trim()
  }
  if (!subOrgId) return { ok: false, error: "no_sub_org" }

  const vault = String(row.address || "").trim()
  const derivedAta = deriveStablecoinAssociatedTokenAddress(vault, asset)
  if (!derivedAta) return { ok: false, error: "ata_derivation_failed" }

  const storedAta = String(row.associated_token_account_address || "").trim()
  if (storedAta && storedAta !== derivedAta) {
    return { ok: false, error: "stored_ata_mismatch_derived" }
  }

  const ensured = await ensureStablecoinTokenAccountOnChain({
    subOrgId,
    vaultAddress: vault,
    asset: asset as "USDC" | "EURC",
    expectedAta: derivedAta,
  })
  if (!ensured.ok) return ensured

  if (!storedAta) {
    await admin
      .from("wallet_accounts")
      .update({
        associated_token_account_address: ensured.ata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
  }

  return { ok: true, ata: ensured.ata }
}
