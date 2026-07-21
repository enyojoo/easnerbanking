/**
 * One-off repair: link vault tx hash, hide Turnkey mirror row, complete YC fund_balance txn.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/repair-yc-fund-balance-vault-mirror-once.ts
 */
import { createClient } from "@supabase/supabase-js"

const TRANSFER_ID = "e123e496-273a-43dc-b13e-f727a5ad8169"
const VAULT_TX_HASH =
  "3tU3NKfTJukkx7hysanmM6HH5HQ1ZgrrFgtUCsGYh3gHAr68z1Cq9sEipz7cV1ttQwWxBdNzGYGnwXA1AWmbdwVK"
const MIRROR_TX_ID = "02cc0cac-87a7-41b8-a46d-bf344a7a9833"
const YC_TX_ID = "addd48d9-5468-4a89-84af-e2f96e9c5de9"
const CREDIT_AMT = 1.781872
const CREDIT_KEY = `yc_fund_balance:${TRANSFER_ID}`

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("supabase_not_configured")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function main() {
  const admin = createAdmin()
  const now = new Date().toISOString()

  const { data: transferBefore } = await admin
    .from("yc_transfers")
    .select("id, status, metadata, leg1_sequence_id, quoted_receive, settlement_info")
    .eq("id", TRANSFER_ID)
    .maybeSingle()
  if (!transferBefore) throw new Error("transfer not found")

  const transferMeta = asMeta(transferBefore.metadata)
  const { error: transferErr } = await admin
    .from("yc_transfers")
    .update({
      metadata: { ...transferMeta, user_vault_tx_hash: VAULT_TX_HASH },
      updated_at: now,
    })
    .eq("id", TRANSFER_ID)
  if (transferErr) throw transferErr

  const { data: mirrorBefore } = await admin
    .from("transactions")
    .select("id, hidden_from_feed, metadata, status")
    .eq("id", MIRROR_TX_ID)
    .maybeSingle()
  if (!mirrorBefore) throw new Error("mirror txn not found")

  const mirrorMeta = asMeta(mirrorBefore.metadata)
  const mirrorAlreadyCredited = mirrorMeta.balance_delta_applied === true
  const { error: mirrorErr } = await admin
    .from("transactions")
    .update({
      hidden_from_feed: true,
      metadata: {
        ...mirrorMeta,
        suppress_in_feed: true,
        yc_fund_balance_chain_mirror: true,
        yc_fund_balance_transaction_id: YC_TX_ID,
      },
      updated_at: now,
    })
    .eq("id", MIRROR_TX_ID)
  if (mirrorErr) throw mirrorErr

  const { data: ycTxBefore } = await admin
    .from("transactions")
    .select("id, status, metadata, occurred_at, created_at")
    .eq("id", YC_TX_ID)
    .maybeSingle()
  if (!ycTxBefore) throw new Error("yc txn not found")

  const prior = asMeta(ycTxBefore.metadata)
  if (prior.wallet_balance_credit_key !== CREDIT_KEY) {
    const completedMeta = {
      ...prior,
      wallet_balance_credit_key: CREDIT_KEY,
      balance_delta_applied: true,
      fund_balance_split_status: "completed",
      user_vault_tx_hash: VAULT_TX_HASH,
      posted_amount: CREDIT_AMT,
      user_net_amount: CREDIT_AMT,
      on_chain_settled_at: now,
      completed_at: now,
      yc_omnibus_tx_hash:
        typeof transferMeta.leg1_omnibus_tx_hash === "string"
          ? transferMeta.leg1_omnibus_tx_hash
          : prior.yc_omnibus_tx_hash,
    }

    const { error: ycErr } = await admin
      .from("transactions")
      .update({
        status: "settled",
        tx_hash: VAULT_TX_HASH,
        settled_at: now,
        metadata: completedMeta,
        updated_at: now,
      })
      .eq("id", YC_TX_ID)
    if (ycErr) throw ycErr
  }

  const { error: transferCompleteErr } = await admin
    .from("yc_transfers")
    .update({
      status: "completed",
      metadata: {
        ...transferMeta,
        user_vault_tx_hash: VAULT_TX_HASH,
        fund_balance_split_status: "completed",
        usd_credit_applied: CREDIT_AMT,
        wallet_balance_credit_key: CREDIT_KEY,
      },
      updated_at: now,
    })
    .eq("id", TRANSFER_ID)
  if (transferCompleteErr) throw transferCompleteErr

  const { data: transferAfter } = await admin
    .from("yc_transfers")
    .select("id, status, metadata")
    .eq("id", TRANSFER_ID)
    .maybeSingle()
  const { data: ycTxAfter } = await admin
    .from("transactions")
    .select("id, status, metadata, hidden_from_feed, easner_transaction_id, tx_hash, settled_at")
    .eq("id", YC_TX_ID)
    .maybeSingle()
  const { data: mirrorAfter } = await admin
    .from("transactions")
    .select("id, status, hidden_from_feed, metadata")
    .eq("id", MIRROR_TX_ID)
    .maybeSingle()

  console.log(
    JSON.stringify(
      {
        ok: true,
        mirrorAlreadyCredited,
        skippedWalletDelta: mirrorAlreadyCredited,
        transfer: {
          id: transferAfter?.id,
          status: transferAfter?.status,
          fund_balance_split_status: asMeta(transferAfter?.metadata).fund_balance_split_status,
          user_vault_tx_hash: asMeta(transferAfter?.metadata).user_vault_tx_hash,
        },
        ycTransaction: {
          id: ycTxAfter?.id,
          easner_transaction_id: ycTxAfter?.easner_transaction_id,
          status: ycTxAfter?.status,
          tx_hash: ycTxAfter?.tx_hash,
          settled_at: ycTxAfter?.settled_at,
          balance_delta_applied: asMeta(ycTxAfter?.metadata).balance_delta_applied,
          on_chain_settled_at: asMeta(ycTxAfter?.metadata).on_chain_settled_at,
        },
        mirrorTransaction: {
          id: mirrorAfter?.id,
          hidden_from_feed: mirrorAfter?.hidden_from_feed,
          yc_fund_balance_chain_mirror: asMeta(mirrorAfter?.metadata).yc_fund_balance_chain_mirror,
        },
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
