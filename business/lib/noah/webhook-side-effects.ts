import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveNoahCustomerTarget } from "@/lib/noah/resolve-noah-customer-target"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { provisionNoahAfterVerificationApproved } from "@/lib/noah/provision-after-approval"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"

function pickTxHash(tx: Record<string, unknown>): string | null {
  const h = tx.TxHash ?? tx.TransactionHash ?? tx.txHash ?? tx.Hash
  return h != null && String(h).trim() ? String(h).trim() : null
}

function workflowIdFromTx(tx: Record<string, unknown>): string | null {
  const w = tx.WorkflowID ?? tx.WorkflowId ?? tx.workflowID
  return w != null && String(w).trim() ? String(w).trim() : null
}

/**
 * Idempotent Noah webhook handlers (Customer, FiatDeposit, Transaction). Shared with `event_inbox` replay.
 */
export async function applyNoahWebhookSideEffects(
  admin: SupabaseClient,
  payload: unknown,
): Promise<void> {
  const p = payload as Record<string, unknown>
  const eventType = String(p.EventType ?? "")
  const data = p.Data as Record<string, unknown> | undefined
  const customerId = data?.CustomerID != null ? String(data.CustomerID) : undefined

  if (eventType === "FiatDeposit" && data) {
    const workflowId =
      data.WorkflowID != null
        ? String(data.WorkflowID)
        : data.WorkflowId != null
          ? String(data.WorkflowId)
          : ""
    if (workflowId) {
      await admin
        .from("payment_intents")
        .update({
          status: "fiat_received",
          intent_snapshot: data as object,
          updated_at: new Date().toISOString(),
        })
        .eq("noah_workflow_id", workflowId)
        .eq("flow_type", "onramp")
    }
  }

  if (eventType === "Transaction" && data) {
    const txData = data as Record<string, unknown>
    const txCustomerId = txData.CustomerID != null ? String(txData.CustomerID) : customerId
    const parsed = txCustomerId
      ? await resolveNoahCustomerTarget(admin, { customerId: txCustomerId, webhookData: txData })
      : null
    if (parsed) {
      const id = String(txData.ID ?? "")
      const { amount, currency } = pickTxAmountAndCurrency(txData)
      const directionRaw = String(txData.Direction ?? "").toLowerCase()
      const direction = directionRaw === "in" ? "in" : directionRaw === "out" ? "out" : null
      const status = String(txData.Status ?? "").toLowerCase() || "unknown"

      let userId: string | null = null
      let businessId: string | null = null
      if (parsed.kind === "individual") {
        userId = parsed.userId
      } else {
        businessId = parsed.businessId
        userId = await resolveBusinessOrgOwnerUserId(admin, parsed.businessId)
      }

      const externalIdRaw = txData.ExternalID ?? txData.externalID ?? txData.ExternalId
      const externalId =
        externalIdRaw != null && String(externalIdRaw).trim() ? String(externalIdRaw).trim() : null
      let autopayoutConfigId: string | null = null
      if (externalId) {
        const { data: terminalSession } = await admin
          .from("terminal_sessions")
          .select("id, status")
          .eq("id", externalId)
          .maybeSingle()
        if (terminalSession?.id) {
          const st = String(txData.Status ?? "").toLowerCase()
          const dir = String(txData.Direction ?? "").toLowerCase()
          let nextStatus: string | null = null
          if (st === "failed" || st === "cancelled") {
            nextStatus = "failed"
          } else if (st === "settled") {
            nextStatus = dir === "in" ? "deposit_detected" : "payout_complete"
          } else if (st === "pending") {
            nextStatus = dir === "in" ? "deposit_detected" : "payout_pending"
          }
          if (nextStatus && nextStatus !== terminalSession.status) {
            await admin
              .from("terminal_sessions")
              .update({ status: nextStatus, updated_at: new Date().toISOString() })
              .eq("id", externalId)
          }
        } else {
          const { data: autopayoutRow } = await admin
            .from("autopayout_configs")
            .select("id")
            .eq("id", externalId)
            .maybeSingle()
          if (autopayoutRow?.id) {
            autopayoutConfigId = String(autopayoutRow.id)
          }
        }
      }

      if (userId && id) {
        const metadata: Record<string, unknown> = { source: "webhook_transaction" }
        if (autopayoutConfigId) {
          metadata.collection_channel = "autopayout"
          metadata.autopayout_config_id = autopayoutConfigId
        }
        await upsertLedgerTransaction(admin, {
          userId,
          businessId,
          provider: "noah",
          providerTransactionId: id,
          status,
          amount,
          currency,
          direction,
          payload: txData,
          metadata,
          txHash: pickTxHash(txData),
          occurredAt: String(txData.Created ?? txData.Updated ?? new Date().toISOString()),
          settledAt: status === "settled" ? String(txData.Updated ?? txData.Created ?? new Date().toISOString()) : null,
          baseCurrency: currency,
        })
      }

      const wf = workflowIdFromTx(txData)
      const intentStatus =
        status === "settled"
          ? "settled"
          : status === "failed" || status === "cancelled"
            ? "failed"
            : "processing"
      const patch: Record<string, unknown> = {
        status: intentStatus,
        noah_transaction_id: id || null,
        tx_hash: pickTxHash(txData),
        updated_at: new Date().toISOString(),
      }
      if (id) {
        await admin.from("payment_intents").update(patch).eq("noah_transaction_id", id)
      }
      if (wf) {
        await admin.from("payment_intents").update(patch).eq("noah_workflow_id", wf)
      }
      if (externalId) {
        await admin.from("payment_intents").update(patch).eq("id", externalId)
      }
    }
  }

  if (eventType === "Customer" && customerId) {
    const parsed = await resolveNoahCustomerTarget(admin, { customerId, webhookData: data })
    if (parsed && data) {
      const occurredAt =
        p.Occurred != null
          ? String(p.Occurred)
          : data.Occurred != null
            ? String(data.Occurred)
            : undefined
      const customerLike: Record<string, unknown> = {
        ...data,
        Verifications: data.Verifications,
        Occurred: occurredAt ?? data.Occurred,
      }
      if (parsed.kind === "individual") {
        await syncNoahCustomerToSupabase(
          { kind: "individual", userId: parsed.userId },
          customerLike,
          customerId,
          { occurredAt },
        )
      } else {
        await syncNoahCustomerToSupabase(
          { kind: "business", businessId: parsed.businessId },
          customerLike,
          customerId,
          { occurredAt },
        )
      }
      const mappedStatus = mapNoahVerificationToKycStatus(customerLike)
      if (mappedStatus === "approved") {
        await provisionNoahAfterVerificationApproved({
          admin,
          scope: parsed.kind === "business" ? "business" : "individual",
          noahCustomerId: customerId,
          subjectUserId: parsed.kind === "individual" ? parsed.userId : "",
          subjectBusinessId: parsed.kind === "business" ? parsed.businessId : null,
        })
      }
    }
  }
}
