import type { SupabaseClient } from "@supabase/supabase-js"
import { PublicKey } from "@solana/web3.js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import {
  resolveSplTransferSenderForVaultInbound,
  tokenBalanceDeltaForVault,
} from "@/lib/turnkey/solana-inbound-sender"
import type { ParsedTx } from "@/lib/turnkey/solana-parsed-tx-accounts"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"

const SUBMIT_SLACK_SEC = 120

export function stablecoinAmountMatches(
  deltaAtomic: bigint,
  decimals: number,
  expected: number,
): boolean {
  if (deltaAtomic <= BigInt(0) || !Number.isFinite(expected) || expected <= 0) return false
  const scale = 10 ** Math.min(9, Math.max(0, decimals))
  const expectedAtomic = BigInt(Math.round(expected * scale))
  return expectedAtomic > BigInt(0) && deltaAtomic === expectedAtomic
}

export function signatureIsAfterFeeSubmit(
  blockTime: number | null | undefined,
  submittedAt: string | null | undefined,
  slackSec = SUBMIT_SLACK_SEC,
): boolean {
  const submitted = String(submittedAt ?? "").trim()
  if (!submitted) return true
  const submittedMs = Date.parse(submitted)
  if (!Number.isFinite(submittedMs)) return true
  if (blockTime == null) return true
  return blockTime * 1000 >= submittedMs - slackSec * 1000
}

async function resolveSenderVaultAddress(
  admin: SupabaseClient,
  input: { userId?: string | null; businessId?: string | null; asset: "USDC" | "EURC" },
): Promise<string | null> {
  const businessId = String(input.businessId || "").trim()
  const userId = String(input.userId || "").trim()
  const ownerLookups: Array<{ owner_type: string; owner_ref: string }> = businessId
    ? [{ owner_type: "business", owner_ref: businessId }]
    : userId
      ? [
          { owner_type: "individual", owner_ref: userId },
          { owner_type: "user", owner_ref: userId },
        ]
      : []
  for (const lookup of ownerLookups) {
    const { data: owner } = await admin
      .from("wallet_owners")
      .select("id")
      .eq("owner_type", lookup.owner_type)
      .eq("owner_ref", lookup.owner_ref)
      .maybeSingle()
    const ownerId = String(owner?.id || "").trim()
    if (!ownerId) continue
    const { data: wallet } = await admin
      .from("wallet_accounts")
      .select("address")
      .eq("wallet_owner_id", ownerId)
      .eq("status", "active")
      .eq("chain", "solana")
      .eq("asset", input.asset)
      .limit(1)
      .maybeSingle()
    const address = String(wallet?.address || "").trim()
    if (address) return address
  }
  return null
}

async function sweepHashAlreadyClaimed(admin: SupabaseClient, signature: string): Promise<boolean> {
  const { data } = await admin
    .from("transactions")
    .select("id")
    .filter("metadata->>fee_wallet_sweep_tx_hash", "eq", signature)
    .limit(1)
  const rows = Array.isArray(data) ? data : data ? [data] : []
  return rows.length > 0
}

/**
 * Turnkey often leaves the fee send `pending` with no signature after the SPL transfer
 * has already credited the fee wallet. Match that inbound so we can book the ledger row.
 */
export async function findFeeWalletSweepSignatureOnChain(
  admin: SupabaseClient,
  input: {
    amount: number
    asset?: "USDC" | "EURC"
    ledgerCurrency: "USD" | "EUR"
    senderUserId?: string | null
    senderBusinessId?: string | null
    fromAddress?: string | null
    submittedAt?: string | null
  },
): Promise<string | null> {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null

  const asset = input.asset === "EURC" ? "EURC" : "USDC"
  const feeWallet = resolveWalletSendFeeSolanaAddress({ ledgerCurrency: input.ledgerCurrency })
  if (!feeWallet) return null

  const expectedSender =
    String(input.fromAddress || "").trim() ||
    (await resolveSenderVaultAddress(admin, {
      userId: input.senderUserId,
      businessId: input.senderBusinessId,
      asset,
    }))
  if (!expectedSender) return null

  const mint = mintForStablecoinAsset(asset)
  const ata = deriveStablecoinAssociatedTokenAddress(feeWallet, asset)
  if (!mint || !ata) return null

  let ataPk: PublicKey
  try {
    ataPk = new PublicKey(ata)
  } catch {
    return null
  }

  const connection = createSolanaRpcConnection()
  let signatures: { signature: string; blockTime?: number | null }[] = []
  try {
    signatures = await connection.getSignaturesForAddress(ataPk, { limit: 30 })
  } catch {
    return null
  }

  const ownerLower = feeWallet.toLowerCase()
  const ataLower = ata.toLowerCase()
  const senderLower = expectedSender.toLowerCase()

  for (const sig of signatures) {
    const signature = String(sig.signature || "").trim()
    if (!signature) continue
    if (!signatureIsAfterFeeSubmit(sig.blockTime, input.submittedAt)) continue
    if (await sweepHashAlreadyClaimed(admin, signature).catch(() => false)) continue

    let tx: ParsedTx | null = null
    try {
      tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })
    } catch {
      continue
    }
    if (!tx?.meta) continue

    const delta = tokenBalanceDeltaForVault(tx, mint, ownerLower, ataLower)
    if (!delta || delta.delta <= BigInt(0)) continue
    if (!stablecoinAmountMatches(delta.delta, delta.decimals, amount)) continue

    const sender = resolveSplTransferSenderForVaultInbound(tx, mint, ownerLower, ataLower)
    if (!sender || sender.toLowerCase() !== senderLower) continue
    return signature
  }

  return null
}
