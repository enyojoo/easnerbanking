import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveNoahCustomerTarget } from "@/lib/noah/resolve-noah-customer-target"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import {
  buildNoahBankPayInLedgerMetadata,
  buildNoahOrchestrationOutLegMetadata,
  extractFiatDepositEnrichment,
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  isNoahBankOnrampOrchestrationOutLeg,
  mergePayInMetadataWithLifecycle,
  pickNoahOrchestrationRuleExecutionId,
} from "@/lib/noah/bank-onramp-tx"
import { findBankOnrampPayInTransaction } from "@/lib/noah/find-bank-onramp-pay-in-transaction"
import { provisionNoahAfterVerificationApproved } from "@/lib/noah/provision-after-approval"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

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

    const fiatCustomerId = data.CustomerID != null ? String(data.CustomerID) : customerId
    const fiatParsed = fiatCustomerId
      ? await resolveNoahCustomerTarget(admin, { customerId: fiatCustomerId, webhookData: data })
      : null
    if (fiatParsed) {
      const fiatEnrichment = extractFiatDepositEnrichment(data)
      if (fiatEnrichment) {
        let fiatUserId: string
        let fiatBusinessId: string | null
        if (fiatParsed.kind === "individual") {
          fiatUserId = fiatParsed.userId
          fiatBusinessId = null
        } else {
          fiatBusinessId = fiatParsed.businessId
          fiatUserId = (await resolveBusinessOrgOwnerUserId(admin, fiatParsed.businessId)) ?? ""
        }
        if (fiatUserId) {
          const existing = await findBankOnrampPayInTransaction(admin, {
            depositId: fiatEnrichment.depositId,
            userId: fiatUserId,
            businessId: fiatBusinessId,
          })
          if (existing) {
            const patch: Record<string, unknown> = {}
            if (fiatEnrichment.senderDisplayName) {
              patch.sender_name = fiatEnrichment.senderDisplayName
              patch.remitter_name = fiatEnrichment.senderDisplayName
            }
            if (fiatEnrichment.paymentReference) {
              patch.reference = fiatEnrichment.paymentReference
            }
            const merged = mergePayInMetadataWithLifecycle(existing.metadata, patch, {
              processing_at: fiatEnrichment.processingAt,
              noah_fiat_deposit_id: fiatEnrichment.depositId,
            })
            await admin
              .from("transactions")
              .update({ metadata: merged, updated_at: new Date().toISOString() })
              .eq("id", existing.id)
          }
        }
      }
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
        const ruleExecutionId = pickNoahOrchestrationRuleExecutionId(txData)
        const isOrchestrationOut = isNoahBankOnrampOrchestrationOutLeg(txData)
        const payInEnrichment = extractNoahBankPayInEnrichment(txData)

        let metadata: Record<string, unknown> = { source: "webhook_transaction" }
        if (autopayoutConfigId) {
          metadata.collection_channel = "autopayout"
          metadata.autopayout_config_id = autopayoutConfigId
        }
        if (isOrchestrationOut) {
          metadata = {
            ...metadata,
            ...buildNoahOrchestrationOutLegMetadata(txData, ruleExecutionId),
          }
        } else if (payInEnrichment) {
          const occurredAt = String(txData.Created ?? txData.Updated ?? new Date().toISOString())
          metadata = {
            ...metadata,
            ...buildNoahBankPayInLedgerMetadata(txData, payInEnrichment, {
              status,
              occurredAt,
            }),
          }
        }

        const upsert = await upsertLedgerTransaction(admin, {
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
          txHash: pickTxHash(txData) ?? payInEnrichment?.onChainTxHash ?? null,
          occurredAt: String(txData.Created ?? txData.Updated ?? new Date().toISOString()),
          settledAt: status === "settled" ? String(txData.Updated ?? txData.Created ?? new Date().toISOString()) : null,
          baseCurrency: currency,
        })

        const shouldCreditWallet =
          !isOrchestrationOut &&
          isNoahBankOnrampFiatPayIn(txData) &&
          status === "settled" &&
          payInEnrichment != null &&
          payInEnrichment.settledStablecoinAmount != null &&
          payInEnrichment.settledStablecoinAmount > 0 &&
          payInEnrichment.walletLedgerCurrency != null &&
          (upsert.inserted || upsert.becameSettled)

        if (shouldCreditWallet) {
          const creditKey = ruleExecutionId ? `noah_bank_onramp:${ruleExecutionId}` : `noah_bank_onramp:${id}`
          let chainAlreadyCredited = false
          if (payInEnrichment.onChainTxHash) {
            const { data: chainRow } = await admin
              .from("transactions")
              .select("id")
              .eq("provider", "turnkey")
              .eq("tx_hash", payInEnrichment.onChainTxHash)
              .eq("status", "settled")
              .maybeSingle()
            chainAlreadyCredited = !!chainRow?.id
          }
          const { data: priorCredit } = await admin
            .from("transactions")
            .select("metadata")
            .eq("id", upsert.transactionId)
            .maybeSingle()
          const priorMeta = (priorCredit?.metadata as Record<string, unknown> | undefined) ?? {}
          if (!chainAlreadyCredited && priorMeta.wallet_balance_credit_key !== creditKey) {
            await applyWalletBalanceDelta(admin, {
              businessId: businessId ? businessId : null,
              userId: businessId ? null : userId,
              currency: payInEnrichment.walletLedgerCurrency!,
              delta: payInEnrichment.settledStablecoinAmount!,
            })
            await admin
              .from("transactions")
              .update({
                metadata: { ...priorMeta, ...metadata, wallet_balance_credit_key: creditKey },
                updated_at: new Date().toISOString(),
              })
              .eq("id", upsert.transactionId)
          }
        }
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
