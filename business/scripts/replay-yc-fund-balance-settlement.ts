/**
 * Replay YC fund_balance settlement when REST is settlement_complete but ledger is still pending.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/replay-yc-fund-balance-settlement.ts ETID72216216
 *   cd business && node --env-file=.env.local --import tsx scripts/replay-yc-fund-balance-settlement.ts ETID72216216 --dry-run
 */
import Module from "node:module"
import { createClient } from "@supabase/supabase-js"
import { yellowcardFetch } from "../lib/yellowcard/http"
import { buildYellowcardPollWebhookEnvelope } from "../lib/reconciliation/yc-transaction-poll"

// Scripts may import Next server modules that pull in `server-only`.
const originalLoad = Module.prototype.require
Module.prototype.require = function patchedRequire(id: string) {
  if (id === "server-only") return {}
  return originalLoad.apply(this, arguments as never)
}

const etid = String(process.argv[2] ?? "").trim().toUpperCase()
const dryRun = process.argv.includes("--dry-run")

if (!etid) {
  console.error("Usage: replay-yc-fund-balance-settlement.ts <ETID> [--dry-run]")
  process.exit(1)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase env")
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const { data: tx, error } = await admin
    .from("transactions")
    .select("id, status, metadata, easner_transaction_id, provider_transaction_id")
    .eq("easner_transaction_id", etid)
    .maybeSingle()
  if (error) throw error
  if (!tx?.id) throw new Error(`transaction not found for ${etid}`)

  const meta = (tx.metadata ?? {}) as Record<string, unknown>
  const transferId = String(meta.yc_transfer_id ?? "").trim()
  const sequenceId = String(
    meta.yc_sequence_id ?? tx.provider_transaction_id ?? "",
  ).trim()

  const { data: transfer } = transferId
    ? await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
    : await admin
        .from("yc_transfers")
        .select("*")
        .eq("leg1_sequence_id", sequenceId)
        .maybeSingle()
  if (!transfer?.id) throw new Error("yc_transfers row not found")

  const receive = await yellowcardFetch<Record<string, unknown>>({
    method: "GET",
    path: `/receive/sequence-id/${encodeURIComponent(String(transfer.leg1_sequence_id))}`,
  })
  const ycStatus = String(receive.status ?? "").trim().toLowerCase()
  const settlement = (receive.settlementInfo ?? {}) as Record<string, unknown>
  console.log(
    JSON.stringify(
      {
        etid,
        ledgerStatus: tx.status,
        transferStatus: transfer.status,
        ycStatus,
        cryptoAmount: settlement.cryptoAmount,
        txHash: settlement.txHash,
        dryRun,
      },
      null,
      2,
    ),
  )

  if (
    ycStatus !== "settlement_complete" &&
    ycStatus !== "complete" &&
    ycStatus !== "completed" &&
    ycStatus !== "settlement_completed"
  ) {
    throw new Error(`YC status is ${ycStatus}, not settlement_complete — refusing replay`)
  }

  const envelope = buildYellowcardPollWebhookEnvelope("receive", receive)
  console.log("envelope.event", envelope.event)

  if (dryRun) {
    console.log("dry-run: would apply webhook side effects")
    return
  }

  const { applyYellowcardWebhookSideEffects } = await import(
    "../lib/yellowcard/webhook-processor"
  )
  await applyYellowcardWebhookSideEffects(admin, envelope)

  const { data: txAfter } = await admin
    .from("transactions")
    .select("status, settled_at, metadata")
    .eq("id", tx.id)
    .maybeSingle()
  const { data: trAfter } = await admin
    .from("yc_transfers")
    .select("status, leg1_status, metadata")
    .eq("id", transfer.id)
    .maybeSingle()
  const trMeta = (trAfter?.metadata ?? {}) as Record<string, unknown>

  console.log(
    JSON.stringify(
      {
        ledgerAfter: txAfter?.status,
        settledAt: txAfter?.settled_at,
        transferAfter: trAfter?.status,
        leg1After: trAfter?.leg1_status,
        splitStatus: trMeta.fund_balance_split_status,
        userVaultHash: trMeta.user_vault_tx_hash,
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
