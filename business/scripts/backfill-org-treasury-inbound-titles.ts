/**
 * Classify historical fee-wallet inbounds as Pay in fee / Payout fee / Payout refund.
 * Metadata only — no new rows, no provider rewrite.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-org-treasury-inbound-titles.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/backfill-org-treasury-inbound-titles.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import {
  classifyOrgTreasuryInboundBackfill,
  mergeOrgTreasuryInboundMetadataPatch,
} from "@easner/shared"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"

const APPLY = process.argv.includes("--apply")
const PAGE = 200

function feeWalletAddresses(): string[] {
  const addrs = new Set<string>()
  for (const ledgerCurrency of ["USD", "EUR"] as const) {
    const owner = resolveWalletSendFeeSolanaAddress({ ledgerCurrency })
    if (!owner) continue
    addrs.add(owner)
    const ata = deriveStablecoinAssociatedTokenAddress(
      owner,
      ledgerCurrency === "EUR" ? "EURC" : "USDC",
    )
    if (ata) addrs.add(ata)
  }
  return [...addrs]
}

async function lookupRelatedDirection(
  admin: ReturnType<typeof createClient>,
  etid: string | null,
): Promise<"in" | "out" | null> {
  const id = String(etid || "").trim()
  if (!id) return null
  const { data } = await admin
    .from("transactions")
    .select("direction")
    .eq("easner_transaction_id", id)
    .limit(1)
    .maybeSingle()
  const dir = String(data?.direction ?? "").toLowerCase()
  return dir === "in" || dir === "out" ? dir : null
}

async function lookupSweepRelated(
  admin: ReturnType<typeof createClient>,
  txHash: string,
): Promise<{ etid: string | null; direction: "in" | "out" | null }> {
  const { data } = await admin
    .from("transactions")
    .select("easner_transaction_id, direction")
    .filter("metadata->>fee_wallet_sweep_tx_hash", "eq", txHash)
    .limit(5)
  const rows = data ?? []
  const row =
    rows.find((r) => String(r.direction ?? "").toLowerCase() === "out") ??
    rows.find((r) => String(r.direction ?? "").toLowerCase() === "in") ??
    rows[0]
  if (!row) return { etid: null, direction: null }
  const direction = String(row.direction ?? "").toLowerCase()
  return {
    etid: row.easner_transaction_id ? String(row.easner_transaction_id) : null,
    direction: direction === "in" || direction === "out" ? direction : null,
  }
}

async function lookupRefundRelated(
  admin: ReturnType<typeof createClient>,
  txHash: string,
): Promise<string | null> {
  const { data } = await admin
    .from("yc_transfers")
    .select("transaction_id, metadata")
    .filter("metadata->>yc_fee_wallet_refund_tx_hash", "eq", txHash)
    .limit(5)
  for (const row of data ?? []) {
    const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
      string,
      unknown
    >
    const fromMeta = String(meta.easner_transaction_id ?? "").trim()
    if (fromMeta) return fromMeta
    const txId = String(row.transaction_id ?? "").trim()
    if (/^ETID/i.test(txId)) return txId
    if (txId) {
      const { data: tx } = await admin
        .from("transactions")
        .select("easner_transaction_id")
        .eq("id", txId)
        .maybeSingle()
      const etid = String(tx?.easner_transaction_id ?? "").trim()
      if (etid) return etid
    }
  }
  return null
}

async function loadFeeWalletInbounds(admin: ReturnType<typeof createClient>) {
  const addresses = feeWalletAddresses()
  const seen = new Set<string>()
  const rows: Array<{
    id: string
    etid: string
    hash: string
    metadata: Record<string, unknown>
    payload: Record<string, unknown> | null
  }> = []

  const ingest = (batch: Array<Record<string, unknown>> | null | undefined) => {
    for (const row of batch ?? []) {
      const id = String(row.id ?? "")
      if (!id || seen.has(id)) continue
      seen.add(id)
      rows.push({
        id,
        etid: String(row.easner_transaction_id ?? ""),
        hash: String(row.tx_hash ?? "").trim(),
        metadata: (row.metadata && typeof row.metadata === "object"
          ? row.metadata
          : {}) as Record<string, unknown>,
        payload:
          row.payload && typeof row.payload === "object"
            ? (row.payload as Record<string, unknown>)
            : null,
      })
    }
  }

  for (const address of addresses) {
    let offset = 0
    for (;;) {
      const { data, error } = await admin
        .from("transactions")
        .select("id, easner_transaction_id, tx_hash, metadata, payload")
        .eq("direction", "in")
        .eq("wallet_address", address)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      ingest(data as Array<Record<string, unknown>> | null)
      if (!data || data.length < PAGE) break
      offset += data.length
    }
  }

  let offset = 0
  for (;;) {
    const { data, error } = await admin
      .from("transactions")
      .select("id, easner_transaction_id, tx_hash, metadata, payload")
      .eq("direction", "in")
      .or(
        "metadata->>fee_wallet_revenue_sweep.eq.true,metadata->>org_treasury_kind.neq.null,payload->>source.eq.fee_wallet_revenue_sweep",
      )
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    ingest(data as Array<Record<string, unknown>> | null)
    if (!data || data.length < PAGE) break
    offset += data.length
  }

  return rows
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const inbounds = await loadFeeWalletInbounds(admin)
  const results: Array<{
    etid: string
    hash: string
    kind: string | null
    related: string | null
    skippedReason?: string
    patched: boolean
  }> = []

  for (const row of inbounds) {
    const existingRelated = String(row.metadata.related_easner_transaction_id ?? "").trim() || null
    const sweep = row.hash ? await lookupSweepRelated(admin, row.hash) : { etid: null, direction: null }
    const refundEtid = row.hash ? await lookupRefundRelated(admin, row.hash) : null
    const relatedDirection = await lookupRelatedDirection(
      admin,
      existingRelated || sweep.etid,
    )
    const classified = classifyOrgTreasuryInboundBackfill({
      metadata: row.metadata,
      payload: row.payload,
      relatedDirection: relatedDirection ?? sweep.direction,
      relatedEtid: existingRelated,
      matchedSweepRelatedEtid: sweep.etid,
      matchedRefundRelatedEtid: refundEtid,
    })
    const patchedMeta = mergeOrgTreasuryInboundMetadataPatch(row.metadata, classified)
    let patched = false
    if (patchedMeta && APPLY) {
      const { error } = await admin
        .from("transactions")
        .update({ metadata: patchedMeta, updated_at: new Date().toISOString() })
        .eq("id", row.id)
      if (error) throw error
      patched = true
    } else if (patchedMeta) {
      patched = true
    }
    results.push({
      etid: row.etid,
      hash: row.hash,
      kind: classified.kind,
      related: classified.relatedEtid,
      ...(classified.skippedReason ? { skippedReason: classified.skippedReason } : {}),
      patched,
    })
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        scanned: inbounds.length,
        classified: results.filter((r) => r.kind).length,
        skipped: results.filter((r) => r.skippedReason).length,
        toPatch: results.filter((r) => r.patched).length,
        rows: results,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
