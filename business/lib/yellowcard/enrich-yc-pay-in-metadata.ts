import type { SupabaseClient } from "@supabase/supabase-js"
import { isYcPayInFlowMetadata, readYcPayInExpiresAt } from "@easner/shared"

export type EnrichYcPayInMetadataResult = {
  metadata: Record<string, unknown>
  backfilled: boolean
}

async function fetchYcTransferExpiry(
  admin: SupabaseClient,
  metadata: Record<string, unknown>,
  transactionLedgerId: string | null | undefined,
): Promise<{ expires_at: string | null; bank_info: unknown } | null> {
  const transferId = String(metadata.yc_transfer_id ?? "").trim()

  if (transferId) {
    const { data } = await admin
      .from("yc_transfers")
      .select("expires_at, bank_info")
      .eq("id", transferId)
      .maybeSingle()
    return data
  }

  if (transactionLedgerId) {
    const { data } = await admin
      .from("yc_transfers")
      .select("expires_at, bank_info")
      .eq("transaction_id", transactionLedgerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
  }

  return null
}

/** Backfill quote_expires_at (and bank info when missing) from yc_transfers for legacy rows. */
export async function enrichYcPayInMetadataFromTransfer(
  admin: SupabaseClient,
  metadata: Record<string, unknown>,
  transactionLedgerId: string | null | undefined,
  options?: { persistBackfill?: boolean },
): Promise<EnrichYcPayInMetadataResult> {
  if (!isYcPayInFlowMetadata(metadata)) {
    return { metadata, backfilled: false }
  }
  if (readYcPayInExpiresAt(metadata)) {
    return { metadata, backfilled: false }
  }

  const transfer = await fetchYcTransferExpiry(admin, metadata, transactionLedgerId)
  const expiresAt = transfer?.expires_at ? String(transfer.expires_at).trim() : ""
  if (!expiresAt) {
    return { metadata, backfilled: false }
  }

  const enriched: Record<string, unknown> = {
    ...metadata,
    quote_expires_at: expiresAt,
  }
  if (
    !metadata.yc_bank_info &&
    transfer?.bank_info &&
    typeof transfer.bank_info === "object" &&
    !Array.isArray(transfer.bank_info)
  ) {
    enriched.yc_bank_info = transfer.bank_info
  }

  if (options?.persistBackfill !== false && transactionLedgerId) {
    void persistYcPayInMetadataBackfill(admin, transactionLedgerId, enriched).catch(() => {
      /* best-effort */
    })
  }

  return { metadata: enriched, backfilled: true }
}

async function persistYcPayInMetadataBackfill(
  admin: SupabaseClient,
  transactionLedgerId: string,
  enriched: Record<string, unknown>,
): Promise<void> {
  const { data: row } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionLedgerId)
    .maybeSingle()

  const prior = (row?.metadata ?? {}) as Record<string, unknown>
  if (readYcPayInExpiresAt(prior)) return

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...prior,
        quote_expires_at: enriched.quote_expires_at,
        ...(enriched.yc_bank_info && !prior.yc_bank_info
          ? { yc_bank_info: enriched.yc_bank_info }
          : {}),
      },
    })
    .eq("id", transactionLedgerId)
}
