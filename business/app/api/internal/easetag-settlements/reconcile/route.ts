import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  listEasetagSettlementsSubmittedStale,
  updateEasetagSettlementFailed,
  updateEasetagSettlementSettled,
} from "@/lib/ledger/easetag-settlement"
import { executeEasetagReversal } from "@/lib/ledger/easetag-transfer"
import { resolveSenderTurnkeySubOrgId } from "@/lib/ledger/easetag-turnkey-settlement"
import { reconcileTurnkeySendStatus } from "@/lib/turnkey/send"

export const runtime = "nodejs"

/**
 * Reconcile stuck Easetag chain settlements (Turnkey send status) and reverse ledger on definitive failure.
 */
export async function POST(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const stale = await listEasetagSettlementsSubmittedStale(admin, { limit: 50, olderThanMs: 45_000 })
  let settled = 0
  let failed = 0
  const errors: string[] = []

  for (const row of stale) {
    if (!row.turnkey_send_status_id) continue
    if (String(row.turnkey_send_status_id).startsWith("sha256:")) {
      errors.push(
        `${row.transfer_group_id}:stored_turnkey_send_status_id_is_activity_fingerprint_not_broadcast_id`,
      )
      continue
    }
    const subOrg = await resolveSenderTurnkeySubOrgId(admin, row.sender_user_id, row.sender_business_id)
    if (!subOrg) {
      errors.push(`${row.transfer_group_id}:no_sub_org`)
      continue
    }
    try {
      const r = await reconcileTurnkeySendStatus(admin, {
        subOrgId: subOrg,
        providerTransactionId: row.turnkey_send_status_id,
      })
      if (r.status === "settled") {
        await updateEasetagSettlementSettled(admin, row.transfer_group_id, r.txHash)
        settled += 1
      } else if (r.status === "failed") {
        await updateEasetagSettlementFailed(admin, row.transfer_group_id, "turnkey_settlement_failed_reconciler")
        const debitPtid = row.debit_provider_transaction_id
        let originalEtid = "UNKNOWN"
        if (debitPtid) {
          const { data: dr } = await admin
            .from("transactions")
            .select("easner_transaction_id")
            .eq("provider", "easner_internal")
            .eq("provider_transaction_id", debitPtid)
            .maybeSingle()
          const t = String(dr?.easner_transaction_id ?? "").trim()
          if (t) originalEtid = t
        }
        const rev = await executeEasetagReversal(admin, {
          transferGroupId: row.transfer_group_id,
          amount: row.amount,
          currency: row.currency,
          senderUserId: row.sender_user_id,
          senderBusinessId: row.sender_business_id,
          payeeUserId: row.payee_user_id,
          payeeBusinessId: row.payee_business_id,
          originalEasnerTransactionId: originalEtid,
        })
        if (!rev.ok) {
          errors.push(`${row.transfer_group_id}:reversal:${rev.error}`)
        }
        failed += 1
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${row.transfer_group_id}:${msg.slice(0, 120)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: stale.length,
    settled,
    failed,
    errors: errors.slice(0, 25),
  })
}
