/**
 * Finalize a fund_balance split stuck in send_submitted.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/finalize-yc-fund-balance-split.ts <transferId>
 */
import Module from "node:module"
import { createClient } from "@supabase/supabase-js"

const originalLoad = Module.prototype.require
Module.prototype.require = function patchedRequire(id: string) {
  if (id === "server-only") return {}
  return originalLoad.apply(this, arguments as never)
}

const transferId = String(process.argv[2] ?? "").trim()
if (!transferId) {
  console.error("Usage: finalize-yc-fund-balance-split.ts <transferId>")
  process.exit(1)
}

async function main() {
  const {
    resolveYcFundBalanceVaultTxHashFromSendId,
    tryCompleteYcFundBalanceFromUserVaultInbound,
    triggerYcFundBalanceOmnibusSplit,
  } = await import("../lib/yellowcard/execute-yc-fund-balance-split")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase env")
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const { data: transfer } = await admin.from("yc_transfers").select("*").eq("id", transferId).maybeSingle()
  if (!transfer?.id) throw new Error("transfer not found")
  const m = (transfer.metadata ?? {}) as Record<string, unknown>
  const sendId = String(m.user_vault_send_id ?? "").trim()
  console.log({ split: m.fund_balance_split_status, sendId, vault: m.user_vault_tx_hash })

  let hash = String(m.user_vault_tx_hash ?? "").trim()
  if (!hash && sendId) {
    hash =
      (await resolveYcFundBalanceVaultTxHashFromSendId(sendId, { timeoutMs: 45_000 })) ?? ""
    console.log("resolved hash", hash)
    if (!hash) {
      const { getTurnkeyApiClient } = await import("../lib/turnkey/client")
      const { getTurnkeyOrganizationId } = await import("../lib/turnkey/config")
      const { interpretTurnkeyGetSendTransactionStatus } = await import(
        "../lib/turnkey/sol-send-polling"
      )
      const orgId = getTurnkeyOrganizationId()
      const client = getTurnkeyApiClient() as {
        getSendTransactionStatus?: (input: Record<string, unknown>) => Promise<unknown>
      } | null
      if (client?.getSendTransactionStatus && orgId) {
        const raw = await client.getSendTransactionStatus({
          organizationId: orgId,
          sendTransactionStatusId: sendId,
        })
        console.log("raw turnkey status", JSON.stringify(raw, null, 2).slice(0, 3000))
        console.log("interpreted", interpretTurnkeyGetSendTransactionStatus(raw))
      }
    }
  }

  if (hash) {
    const done = await tryCompleteYcFundBalanceFromUserVaultInbound(admin, {
      txHash: hash,
      userId: String(transfer.user_id),
      businessId: transfer.business_id ? String(transfer.business_id) : null,
      amount: Number(m.usd_credit_applied ?? m.usd_credit ?? 0),
    })
    console.log("tryComplete", done)
  } else {
    const split = await triggerYcFundBalanceOmnibusSplit(admin, {
      transferId,
      transactionId: transfer.transaction_id ? String(transfer.transaction_id) : null,
      payload: { settlementInfo: transfer.settlement_info ?? {} },
      omnibusTxHash: String(m.leg1_omnibus_tx_hash ?? ""),
      omnibusAmount: Number(m.omnibus_in_actual ?? 0) || null,
    })
    console.log("retrigger", split)
  }

  const { data: tr2 } = await admin.from("yc_transfers").select("status, metadata").eq("id", transferId).maybeSingle()
  const { data: tx2 } = await admin
    .from("transactions")
    .select("status, settled_at, easner_transaction_id")
    .eq("id", String(transfer.transaction_id))
    .maybeSingle()
  console.log({
    etid: tx2?.easner_transaction_id,
    ledger: tx2?.status,
    settledAt: tx2?.settled_at,
    transfer: tr2?.status,
    split: (tr2?.metadata as Record<string, unknown> | null)?.fund_balance_split_status,
    vault: (tr2?.metadata as Record<string, unknown> | null)?.user_vault_tx_hash,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
