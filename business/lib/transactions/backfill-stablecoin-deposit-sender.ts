import type { SupabaseClient } from "@supabase/supabase-js"
import type { Connection } from "@solana/web3.js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { createSolanaRpcConnection } from "@/lib/solana/rpc-connection"
import { mintForStablecoinAsset } from "@/lib/solana/spl-mints"
import { relayGetRequestV3 } from "@/lib/relay/client"
import { resolveSolanaInboundSenderFromTxHash } from "@/lib/turnkey/solana-inbound-sender"

type StablecoinDepositRow = {
  id: string
  provider: string | null
  direction: string | null
  status: string | null
  tx_hash: string | null
  wallet_address: string | null
  counterparty_address: string | null
  asset: string | null
  chain: string | null
  metadata: Record<string, unknown> | null
  user_id: string | null
  business_id: string | null
}

function asMeta(row: StablecoinDepositRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === "object" ? row.metadata : {}
}

function isOrganicTurnkeyStablecoinDeposit(row: StablecoinDepositRow): boolean {
  const meta = asMeta(row)
  if (String(meta.flow ?? "").toLowerCase() === "bank_onramp") return false
  if (String(meta.source ?? "").toLowerCase() === "easetag_p2p") return false
  if (String(meta.activity_type ?? "").toLowerCase() === "wallet_send") return false
  const provider = String(row.provider ?? "").toLowerCase()
  if (provider !== "turnkey") return false
  const asset = String(row.asset ?? "").toUpperCase()
  if (asset !== "USDC" && asset !== "EURC") return false
  return String(row.chain ?? "solana").toLowerCase() === "solana"
}

function isRelayTronStablecoinDeposit(row: StablecoinDepositRow): boolean {
  const meta = asMeta(row)
  return (
    String(row.provider ?? "").toLowerCase() === "relay" &&
    String(meta.activity_type ?? "").trim().toLowerCase() === "relay_tron_deposit"
  )
}

export function isStablecoinDepositSenderBackfillCandidate(row: StablecoinDepositRow): boolean {
  if (String(row.direction ?? "").toLowerCase() !== "in") return false
  if (String(row.status ?? "").toLowerCase() !== "settled") return false
  if (String(row.counterparty_address ?? "").trim()) return false
  return isOrganicTurnkeyStablecoinDeposit(row) || isRelayTronStablecoinDeposit(row)
}

async function resolveRelayTronSender(
  admin: SupabaseClient,
  row: StablecoinDepositRow,
): Promise<string | null> {
  const meta = asMeta(row)
  const fromMeta = String(meta.sender_tron_address ?? meta.from_address ?? "").trim()
  if (fromMeta) return fromMeta

  const { data: deposit } = await admin
    .from("relay_deposits")
    .select("metadata, relay_request_id")
    .eq("ledger_tx_id", row.id)
    .maybeSingle()

  const depositMeta =
    deposit?.metadata && typeof deposit.metadata === "object"
      ? (deposit.metadata as Record<string, unknown>)
      : {}
  const fromDeposit = String(depositMeta.sender_tron_address ?? "").trim()
  if (fromDeposit) return fromDeposit

  const relayRequestId = String(deposit?.relay_request_id ?? meta.relay_request_id ?? "").trim()
  if (!relayRequestId) return null

  try {
    const request = await relayGetRequestV3(relayRequestId)
    const sender = String(request.sender ?? "").trim()
    if (sender) return sender
    return String(request.depositAddress?.depositor ?? "").trim() || null
  } catch {
    return null
  }
}

async function resolveTurnkeySolanaSender(
  connection: Connection,
  row: StablecoinDepositRow,
): Promise<string | null> {
  const txHash = String(row.tx_hash ?? "").trim()
  const ownerAddress = String(row.wallet_address ?? "").trim()
  const asset = String(row.asset ?? "").toUpperCase() as "USDC" | "EURC"
  if (!txHash || !ownerAddress || (asset !== "USDC" && asset !== "EURC")) return null

  const mint = mintForStablecoinAsset(asset)
  if (!mint) return null

  const meta = asMeta(row)
  const tokenAccountAddress =
    String(meta.associated_token_account_address ?? "").trim() ||
    deriveStablecoinAssociatedTokenAddress(ownerAddress, asset) ||
    null

  return resolveSolanaInboundSenderFromTxHash(connection, {
    txHash,
    mint,
    ownerAddress,
    tokenAccountAddress,
  })
}

export async function backfillStablecoinDepositSenderForRow(
  admin: SupabaseClient,
  row: StablecoinDepositRow,
  connection?: Connection,
): Promise<{ updated: boolean; sender: string | null; reason?: string }> {
  if (!isStablecoinDepositSenderBackfillCandidate(row)) {
    return { updated: false, sender: null, reason: "not_candidate" }
  }

  const meta = asMeta(row)
  const sender = isRelayTronStablecoinDeposit(row)
    ? await resolveRelayTronSender(admin, row)
    : await resolveTurnkeySolanaSender(connection ?? createSolanaRpcConnection(), row)

  if (!sender) return { updated: false, sender: null, reason: "sender_unresolved" }

  const nextMeta: Record<string, unknown> = {
    ...meta,
    from_address: sender,
  }
  if (isRelayTronStablecoinDeposit(row)) {
    nextMeta.sender_tron_address = sender
  }
  if (!meta.source_payment_rail && isOrganicTurnkeyStablecoinDeposit(row)) {
    nextMeta.source_payment_rail = "solana"
  }
  if (!meta.source_currency && row.asset) {
    nextMeta.source_currency = String(row.asset).toUpperCase()
  }

  const { error } = await admin
    .from("transactions")
    .update({
      counterparty_address: sender,
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  if (error) return { updated: false, sender: null, reason: error.message }
  return { updated: true, sender }
}

export async function backfillStablecoinDepositSenders(
  admin: SupabaseClient,
  opts?: {
    limit?: number
    userId?: string | null
    businessId?: string | null
    connection?: Connection
    throttleMs?: number
    dryRun?: boolean
  },
): Promise<{
  scanned: number
  updated: number
  skipped: number
  failures: Array<{ id: string; reason?: string }>
}> {
  const limit = Math.max(1, Math.min(500, Math.floor(opts?.limit ?? 100)))
  const throttleMs = Math.max(0, Math.min(1000, Math.floor(opts?.throttleMs ?? 150)))
  const connection = opts?.connection ?? createSolanaRpcConnection()

  let q = admin
    .from("transactions")
    .select(
      "id, provider, direction, status, tx_hash, wallet_address, counterparty_address, asset, chain, metadata, user_id, business_id",
    )
    .eq("direction", "in")
    .eq("status", "settled")
    .is("counterparty_address", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (opts?.businessId) q = q.eq("business_id", opts.businessId)
  else if (opts?.userId) q = q.eq("user_id", opts.userId).is("business_id", null)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  let updated = 0
  let skipped = 0
  const failures: Array<{ id: string; reason?: string }> = []

  for (const raw of data ?? []) {
    const row = raw as StablecoinDepositRow
    if (!isStablecoinDepositSenderBackfillCandidate(row)) {
      skipped += 1
      continue
    }

    if (opts?.dryRun) {
      updated += 1
      continue
    }

    const result = await backfillStablecoinDepositSenderForRow(admin, row, connection)
    if (result.updated) {
      updated += 1
    } else {
      skipped += 1
      failures.push({ id: row.id, reason: result.reason })
    }

    if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs))
  }

  return { scanned: data?.length ?? 0, updated, skipped, failures }
}

export async function backfillStablecoinDepositSendersForOwner(
  admin: SupabaseClient,
  scope: { userId: string; businessId: string | null },
  opts?: { limit?: number; connection?: Connection; dryRun?: boolean },
): Promise<{ scanned: number; updated: number; skipped: number; failures: Array<{ id: string; reason?: string }> }> {
  return backfillStablecoinDepositSenders(admin, {
    ...opts,
    userId: scope.businessId ? null : scope.userId,
    businessId: scope.businessId,
    limit: opts?.limit ?? 20,
    throttleMs: 200,
  })
}
