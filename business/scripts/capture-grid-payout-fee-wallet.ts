/**
 * One-off: sweep deferred Easner revenue for a Grid balance payout to the fee wallet.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/capture-grid-payout-fee-wallet.ts ETID48224171
 */
import Module from "node:module"

const originalLoad = Module.prototype.require
Module.prototype.require = function patchedRequire(id: string) {
  if (id === "server-only") return {}
  return originalLoad.apply(this, arguments as never)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function main() {
  const { captureGridBalancePayoutProcessingFeeIfPending } = await import(
    "../lib/processing-fee/capture-pending-processing-fee"
  )
  const { createSupabaseAdmin } = await import("../lib/supabase/admin")

  const lookup = String(process.argv[2] ?? "ETID48224171").trim()
  if (!lookup) {
    console.error("usage: capture-grid-payout-fee-wallet.ts <etid-or-uuid>")
    process.exit(1)
  }

  const admin = createSupabaseAdmin()
  const byEtid = lookup.toUpperCase().startsWith("ETID")
  const { data: row, error } = await admin
    .from("transactions")
    .select("id, user_id, business_id, status, amount, metadata, easner_transaction_id")
    .eq(byEtid ? "easner_transaction_id" : "id", lookup)
    .maybeSingle()

  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  if (!row?.id) {
    console.error(`transaction not found: ${lookup}`)
    process.exit(1)
  }

  const meta = asRecord(row.metadata)
  const already =
    Boolean(String(meta.fee_wallet_sweep_tx_hash ?? "").trim()) ||
    Boolean(String(meta.processing_fee_turnkey_send_id ?? "").trim())

  console.log(
    JSON.stringify(
      {
        id: row.id,
        etid: row.easner_transaction_id,
        status: row.status,
        amount: row.amount,
        processing_fee: meta.processing_fee,
        margin_amount: meta.margin_amount,
        total_debited: meta.total_debited,
        crypto_authorized_amount: meta.crypto_authorized_amount,
        turnkey_send_id: meta.turnkey_send_id,
        processing_fee_pending: meta.processing_fee_pending,
        fee_wallet_sweep: meta.fee_wallet_sweep,
        fee_wallet_sweep_tx_hash: meta.fee_wallet_sweep_tx_hash,
        processing_fee_turnkey_send_id: meta.processing_fee_turnkey_send_id,
        processing_fee_captured_at: meta.processing_fee_captured_at,
      },
      null,
      2,
    ),
  )

  if (!already) {
    const result = await captureGridBalancePayoutProcessingFeeIfPending(admin, {
      transactionId: String(row.id),
      userId: String(row.user_id),
      businessId: row.business_id != null ? String(row.business_id) : null,
    })
    if (!result.captured) process.exit(2)
  }

  const { data: after } = await admin
    .from("transactions")
    .select("metadata, status")
    .eq("id", row.id)
    .maybeSingle()
  const afterMeta = asRecord(after?.metadata)
  const feeSendId = String(afterMeta.processing_fee_turnkey_send_id ?? "").trim()
  let feeSend = null
  if (feeSendId) {
    const { data } = await admin
      .from("transactions")
      .select("id, status, amount, tx_hash, provider_transaction_id, easner_transaction_id")
      .eq("provider_transaction_id", feeSendId)
      .maybeSingle()
    feeSend = data
  }

  console.log(
    JSON.stringify(
      {
        captured: already || true,
        status: after?.status,
        processing_fee_pending: afterMeta.processing_fee_pending,
        fee_wallet_sweep: afterMeta.fee_wallet_sweep,
        fee_wallet_sweep_tx_hash: afterMeta.fee_wallet_sweep_tx_hash ?? feeSend?.tx_hash ?? null,
        processing_fee_turnkey_send_id: afterMeta.processing_fee_turnkey_send_id,
        processing_fee_captured_at: afterMeta.processing_fee_captured_at,
        fee_send: feeSend,
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
