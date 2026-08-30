/**
 * Delete Turnkey chain mirrors and orphan express-deposit processing rows.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/heal-stripe-onramp-transaction-feed.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/heal-stripe-onramp-transaction-feed.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { readStripeOnrampTxHash } from "../lib/stripe/onramp-session-tx-hash"
import { suppressTurnkeyStripeOnrampChainMirrorRow } from "../lib/stripe/stripe-onramp-turnkey-mirror"
import { buildStripeOnrampCreditKey } from "../lib/stripe/onramp-credit-key"

const dryRun = process.argv.includes("--dry-run")

async function healTurnkeyMirrorsFromSettledStripeRows(admin: ReturnType<typeof createSupabaseAdmin>): Promise<{
  deleted: number
  reversed: number
}> {
  const { data: rows, error } = await admin
    .from("transactions")
    .select("id, user_id, business_id, provider_transaction_id, tx_hash, payload")
    .eq("provider", "stripe")
    .eq("direction", "in")
    .eq("status", "settled")
    .filter("metadata->>flow", "eq", "express_deposits")
  if (error) throw error

  let deleted = 0
  let reversed = 0
  for (const row of rows ?? []) {
    const payload = (row.payload as Record<string, unknown> | null) ?? {}
    const txHash = String(row.tx_hash || readStripeOnrampTxHash(payload) || "").trim()
    const stripeSessionId = String(row.provider_transaction_id || "").trim()
    if (!txHash || !stripeSessionId) continue
    if (dryRun) {
      deleted += 1
      continue
    }
    const result = await suppressTurnkeyStripeOnrampChainMirrorRow(admin, {
      txHash,
      userId: String(row.user_id),
      businessId: row.business_id ? String(row.business_id) : null,
      stripeSessionId,
    })
    deleted += result.suppressed
    reversed += result.reversedBalance
    await admin
      .from("stripe_onramp_sessions")
      .update({ chain_tx_hash: txHash, updated_at: new Date().toISOString() })
      .eq("stripe_session_id", stripeSessionId)
      .is("chain_tx_hash", null)
  }
  return { deleted, reversed }
}

async function main() {
  const admin = createSupabaseAdmin()
  const { data: sessions, error } = await admin
    .from("stripe_onramp_sessions")
    .select("stripe_session_id, user_id, business_id, chain_tx_hash, usd_credit, status")
    .not("chain_tx_hash", "is", null)
    .in("status", ["fulfillment_complete", "fulfilled", "complete"])

  if (error) throw error

  let mirrored = 0
  let reversed = 0
  let deletedOrphans = 0
  let healedSettled = 0

  const settledSessionIds = new Set(
    (sessions ?? []).map((row) => String(row.stripe_session_id || "").trim()).filter(Boolean),
  )

  for (const session of sessions ?? []) {
    const txHash = String(session.chain_tx_hash || "").trim()
    if (!txHash) continue
    if (dryRun) {
      mirrored += 1
      continue
    }
    const result = await suppressTurnkeyStripeOnrampChainMirrorRow(admin, {
      txHash,
      userId: String(session.user_id),
      businessId: session.business_id ? String(session.business_id) : null,
      stripeSessionId: String(session.stripe_session_id),
    })
    mirrored += result.suppressed
    reversed += result.reversedBalance
  }

  const ledgerMirrors = await healTurnkeyMirrorsFromSettledStripeRows(admin)
  mirrored += ledgerMirrors.deleted
  reversed += ledgerMirrors.reversed

  const { data: stale, error: staleErr } = await admin
    .from("transactions")
    .select("id, provider_transaction_id, status, metadata")
    .eq("provider", "stripe")
    .eq("direction", "in")
    .in("status", ["processing", "cancelled"])
    .filter("metadata->>flow", "eq", "express_deposits")

  if (staleErr) throw staleErr

  for (const row of stale ?? []) {
    const sessionId = String(row.provider_transaction_id || "").trim()
    if (sessionId && settledSessionIds.has(sessionId)) continue
    deletedOrphans += 1
    if (dryRun) continue
    await admin.from("transactions").delete().eq("id", row.id)
  }

  for (const session of sessions ?? []) {
    const stripeSessionId = String(session.stripe_session_id || "").trim()
    if (!stripeSessionId) continue
    const { data: txRow } = await admin
      .from("transactions")
      .select("id, metadata, status, settled_at")
      .eq("provider", "stripe")
      .eq("provider_transaction_id", stripeSessionId)
      .maybeSingle()
    if (!txRow?.id || String(txRow.status) !== "settled") continue
    const meta = (txRow.metadata as Record<string, unknown> | undefined) ?? {}
    const creditKey = buildStripeOnrampCreditKey(stripeSessionId)
    const patch: Record<string, unknown> = {}
    if (!meta.processing_at) {
      patch.processing_at = txRow.settled_at ?? new Date().toISOString()
    }
    if (!meta.completed_at) {
      patch.completed_at = txRow.settled_at ?? new Date().toISOString()
    }
    if (meta.wallet_balance_credit_key !== creditKey) {
      patch.wallet_balance_credit_key = creditKey
    }
    if (Object.keys(patch).length === 0) continue
    healedSettled += 1
    if (dryRun) continue
    await admin
      .from("transactions")
      .update({
        metadata: { ...meta, ...patch },
        updated_at: new Date().toISOString(),
      })
      .eq("id", txRow.id)
  }

  console.info(
    JSON.stringify({
      dry_run: dryRun,
      sessions_scanned: sessions?.length ?? 0,
      turnkey_mirrors_deleted: mirrored,
      balance_reversed: reversed,
      orphan_processing_deleted: deletedOrphans,
      settled_rows_healed: healedSettled,
    }),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
