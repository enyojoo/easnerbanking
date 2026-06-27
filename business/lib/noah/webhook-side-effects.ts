import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildVerificationDepositMetadataFields,
  classifyVerificationDeposit,
  deriveBankDepositNarrationLabel,
} from "@easner/shared"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveNoahCustomerTarget } from "@/lib/noah/resolve-noah-customer-target"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import {
  pickNoahGlobalPayoutLedgerFields,
  isNoahGlobalPayoutSellTx,
  isNoahGlobalPayoutOrchestrationInLegShape,
  extractNoahGlobalPayoutPayOutEnrichment,
  buildNoahGlobalPayoutPayOutMetadata,
  findPendingGlobalPayoutByExternalId,
  linkPendingGlobalPayoutToNoahTransactionId,
  handleNoahGlobalPayoutOrchestrationInWebhook,
  handleNoahGlobalPayoutRefundOutWebhook,
  isNoahGlobalPayoutRefundOutLeg,
  pickNoahGlobalPayoutOrchestrationRuleExecutionId,
  reverseGlobalPayoutWalletDebitForEasnerPayoutId,
  settlementWalletCurrencyForNoahCrypto,
} from "@/lib/noah/global-payout-ledger"
import {
  buildNoahBankPayInLedgerMetadata,
  buildNoahFundingFiatDepositLedgerMetadata,
  buildNoahVerificationFiatDepositLedgerMetadata,
  extractFiatDepositEnrichment,
  extractNoahBankPayInEnrichment,
  isNoahBankOnrampFiatPayIn,
  isNoahBankOnrampOrchestrationInLeg,
  isNoahBankOnrampOrchestrationOutLeg,
  isVerificationFiatDeposit,
  mergeGlobalPayoutLifecycleMetadata,
  mergePayInMetadataWithLifecycle,
  pickNoahOrchestrationRuleExecutionId,
} from "@/lib/noah/bank-onramp-tx"
import { findBankOnrampPayInTransaction } from "@/lib/noah/find-bank-onramp-pay-in-transaction"
import {
  applyNoahBankOnrampOrchestrationOutSideEffects,
  tryCreditNoahBankOnrampPayInWallet,
} from "@/lib/noah/credit-bank-onramp-wallet"
import { provisionNoahAfterVerificationApproved } from "@/lib/noah/provision-after-approval"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyGlobalPayoutMarginReconciliation, applyGlobalPayoutChannelFeeReconciliation } from "@/lib/noah/reconcile-payout-margin"

function pickWebhookOccurredIso(
  envelope: Record<string, unknown>,
  data: Record<string, unknown>,
): string {
  for (const c of [envelope.Occurred, data.Occurred, data.Created, data.Updated]) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return new Date().toISOString()
}

function pickTxHash(tx: Record<string, unknown>): string | null {
  const h = tx.TxHash ?? tx.TransactionHash ?? tx.txHash ?? tx.Hash ?? tx.PublicID
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
          if (isVerificationFiatDeposit(fiatEnrichment)) {
            if (fiatEnrichment.status === "settled") {
              const occurred = String(p.Occurred ?? data.Created ?? new Date().toISOString())
              const metadata = buildNoahVerificationFiatDepositLedgerMetadata(data, fiatEnrichment, {
                occurredAt: fiatEnrichment.processingAt,
                completedAt: occurred,
              })
              await upsertLedgerTransaction(admin, {
                userId: fiatUserId,
                businessId: fiatBusinessId,
                provider: "noah",
                providerTransactionId: fiatEnrichment.depositId,
                status: "settled",
                amount: fiatEnrichment.fiatAmount,
                currency: fiatEnrichment.fiatCurrency,
                direction: "in",
                payload: data,
                metadata,
                occurredAt: fiatEnrichment.processingAt ?? occurred,
                settledAt: occurred,
                baseCurrency: fiatEnrichment.fiatCurrency,
              })
            }
          } else {
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
                patch.noah_fiat_deposit_sender_name = fiatEnrichment.senderDisplayName
              }
              if (fiatEnrichment.paymentReference) {
                patch.payment_reference = fiatEnrichment.paymentReference
                patch.reference = fiatEnrichment.paymentReference
                const depositNarration = deriveBankDepositNarrationLabel({
                  paymentReference: fiatEnrichment.paymentReference,
                })
                if (depositNarration) {
                  patch.deposit_narration = depositNarration
                  patch.narration = depositNarration
                }
              }
              if (fiatEnrichment.paymentMethodType) {
                patch.noah_payment_method_type = fiatEnrichment.paymentMethodType
              }
              const verificationFields = buildVerificationDepositMetadataFields({
                payload: data,
                metadata: {
                  ...(existing.metadata ?? {}),
                  ...patch,
                  fiat_deposit_amount: fiatEnrichment.fiatAmount,
                },
                fiatAmount: fiatEnrichment.fiatAmount,
                fiatDepositSenderName: fiatEnrichment.senderDisplayName,
              })
              patch.deposit_kind = verificationFields.deposit_kind
              patch.verification_bank_name = verificationFields.verification_bank_name
              const merged = mergePayInMetadataWithLifecycle(existing.metadata, patch, {
                processing_at: fiatEnrichment.processingAt,
                noah_fiat_deposit_id: fiatEnrichment.depositId,
              })
              await admin
                .from("transactions")
                .update({ metadata: merged, updated_at: new Date().toISOString() })
                .eq("id", existing.id)
            } else {
              const occurred = String(p.Occurred ?? data.Created ?? new Date().toISOString())
              const metadata = buildNoahFundingFiatDepositLedgerMetadata(data, fiatEnrichment, {
                occurredAt: fiatEnrichment.processingAt,
                completedAt: fiatEnrichment.status === "settled" ? occurred : null,
              })
              const st =
                fiatEnrichment.status === "settled"
                  ? "settled"
                  : fiatEnrichment.status === "pending"
                    ? "pending"
                    : "processing"
              await upsertLedgerTransaction(admin, {
                userId: fiatUserId,
                businessId: fiatBusinessId,
                provider: "noah",
                providerTransactionId: fiatEnrichment.depositId,
                status: st,
                amount: fiatEnrichment.fiatAmount,
                currency: fiatEnrichment.fiatCurrency,
                direction: "in",
                payload: data,
                metadata,
                occurredAt: fiatEnrichment.processingAt ?? occurred,
                settledAt: st === "settled" ? occurred : null,
                baseCurrency: fiatEnrichment.fiatCurrency,
              })
            }
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
      const webhookOccurred = pickWebhookOccurredIso(p, txData)

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
        const ruleExecutionId = pickNoahGlobalPayoutOrchestrationRuleExecutionId(txData)
        const isOrchestrationOut = isNoahBankOnrampOrchestrationOutLeg(txData)
        const payInEnrichment = extractNoahBankPayInEnrichment(txData)
        const solanaTxHash = pickTxHash(txData)

        if (isNoahGlobalPayoutOrchestrationInLegShape(txData)) {
          await handleNoahGlobalPayoutOrchestrationInWebhook(admin, {
            noahTransactionId: id,
            txData,
            status,
            userId,
            businessId,
            externalId,
            ruleExecutionId,
            solanaTxHash,
          })
        } else if (isNoahGlobalPayoutRefundOutLeg(txData)) {
          await handleNoahGlobalPayoutRefundOutWebhook(admin, {
            noahTransactionId: id,
            txData,
            status,
            userId,
            businessId,
            externalId,
            solanaTxHash,
          })
        } else if (isOrchestrationOut) {
          await applyNoahBankOnrampOrchestrationOutSideEffects(admin, {
            txData,
            status,
            userId,
            businessId,
            occurredAt: webhookOccurred,
          })
        } else if (
          isNoahBankOnrampOrchestrationInLeg(txData) &&
          !isNoahGlobalPayoutOrchestrationInLegShape(txData)
        ) {
          // Internal on-chain orchestration IN — fiat pay-in row is user-facing.
        } else if (
          isNoahBankOnrampFiatPayIn(txData) &&
          payInEnrichment &&
          classifyVerificationDeposit({
            payload: txData,
            fiatAmount: payInEnrichment.fiatAmount,
            settledStablecoinAmount: payInEnrichment.settledStablecoinAmount,
          }) === "verification"
        ) {
          // Verification microdeposits: ledger row is FiatDeposit-first only.
        } else {
        let metadata: Record<string, unknown> = { source: "webhook_transaction" }
        if (autopayoutConfigId) {
          metadata.collection_channel = "autopayout"
          metadata.autopayout_config_id = autopayoutConfigId
        }
        if (payInEnrichment && isNoahBankOnrampFiatPayIn(txData)) {
          const occurredAt = webhookOccurred
          const depositId =
            payInEnrichment.ruleExecutionId ??
            pickNoahOrchestrationRuleExecutionId(txData) ??
            null
          let fiatDepositSenderName: string | null = null
          let paymentReference: string | null = null
          if (depositId) {
            const existingPayIn = await findBankOnrampPayInTransaction(admin, {
              depositId,
              userId,
              businessId,
            })
            const prior = existingPayIn?.metadata ?? {}
            fiatDepositSenderName =
              (typeof prior.noah_fiat_deposit_sender_name === "string" &&
                prior.noah_fiat_deposit_sender_name.trim()) ||
              (typeof prior.sender_name === "string" && prior.sender_name.trim()) ||
              null
            paymentReference =
              (typeof prior.reference === "string" && prior.reference.trim()) || null
          }
          metadata = {
            ...metadata,
            ...buildNoahBankPayInLedgerMetadata(txData, payInEnrichment, {
              status,
              occurredAt,
              fiatDepositSenderName,
              paymentReference,
            }),
          }
        }

        const isGlobalPayoutSell = isNoahGlobalPayoutSellTx(txData)
        const payoutEnrichment = isGlobalPayoutSell ? extractNoahGlobalPayoutPayOutEnrichment(txData) : null
        let ledgerAmount = amount
        let ledgerCurrency = currency
        let ledgerBaseCurrency = currency
        let ledgerAsset: string | undefined

        if (isGlobalPayoutSell) {
          let priorMeta: Record<string, unknown> = {}
          if (externalId) {
            const pending = await findPendingGlobalPayoutByExternalId(admin, externalId)
            if (pending) {
              priorMeta = pending.metadata
              if (pending.id) {
                await linkPendingGlobalPayoutToNoahTransactionId(admin, {
                  pendingRowId: pending.id,
                  noahTransactionId: id,
                })
              }
            }
          }
          if (!Object.keys(priorMeta).length) {
            const { data: existingTx } = await admin
              .from("transactions")
              .select("metadata")
              .eq("provider", "noah")
              .eq("provider_transaction_id", id)
              .maybeSingle()
            priorMeta = (existingTx?.metadata as Record<string, unknown> | null) ?? {}
          }
          const priorCrypto =
            typeof priorMeta.crypto_authorized_amount === "string"
              ? priorMeta.crypto_authorized_amount
              : undefined
          const sourceBalanceCurrency =
            typeof priorMeta.execution_model === "string" &&
            priorMeta.payout_type === "global_fiat"
              ? settlementWalletCurrencyForNoahCrypto(String(txData.CryptoCurrency ?? ""))
              : undefined
          const ledger = pickNoahGlobalPayoutLedgerFields(txData, {
            cryptoAuthorizedAmount: priorCrypto,
            sourceBalanceCurrency,
          })
          ledgerAmount = ledger.amount > 0 ? ledger.amount : amount
          ledgerCurrency = ledger.currency
          ledgerBaseCurrency = ledger.baseCurrency
          ledgerAsset = ledger.asset ?? undefined
          metadata = {
            ...metadata,
            ...priorMeta,
            payout_type: "global_fiat",
            execution_model: priorMeta.execution_model ?? "turnkey_workflow",
            receive_amount: ledger.receiveAmount,
            receive_currency: ledger.receiveCurrency,
            crypto_asset: ledger.asset,
            noah_transaction_id: id,
            ...(externalId ? { easner_payout_id: externalId } : {}),
            ...(priorCrypto ? { crypto_authorized_amount: priorCrypto } : {}),
            ...(payoutEnrichment ? buildNoahGlobalPayoutPayOutMetadata(txData, payoutEnrichment) : {}),
          }
          const lifecyclePatch: {
            transaction_started_at?: string | null
            processing_at?: string | null
            completed_at?: string | null
            failed_at?: string | null
          } = {
            transaction_started_at:
              typeof priorMeta.transaction_started_at === "string"
                ? priorMeta.transaction_started_at
                : null,
          }
          if (status === "pending" || status === "processing") {
            lifecyclePatch.processing_at = webhookOccurred
          }
          if (status === "settled") {
            lifecyclePatch.completed_at = webhookOccurred
          }
          if (status === "failed" || status === "cancelled") {
            lifecyclePatch.failed_at = webhookOccurred
            metadata = {
              ...metadata,
              noah_refund_expected: true,
            }
          }
          metadata = mergeGlobalPayoutLifecycleMetadata(metadata, lifecyclePatch)
        }

        const upsert = await upsertLedgerTransaction(admin, {
          userId,
          businessId,
          provider: "noah",
          providerTransactionId: id,
          status,
          amount: ledgerAmount,
          currency: ledgerCurrency,
          direction,
          payload: txData,
          metadata,
          txHash: pickTxHash(txData) ?? payInEnrichment?.onChainTxHash ?? null,
          occurredAt: webhookOccurred,
          settledAt: status === "settled" ? webhookOccurred : null,
          baseCurrency: ledgerBaseCurrency,
          asset: ledgerAsset,
        })

        const shouldCreditWallet =
          isNoahBankOnrampFiatPayIn(txData) &&
          status === "settled" &&
          payInEnrichment != null &&
          payInEnrichment.settledStablecoinAmount != null &&
          payInEnrichment.settledStablecoinAmount > 0 &&
          payInEnrichment.walletLedgerCurrency != null &&
          (upsert.inserted || upsert.becameSettled)

        if (shouldCreditWallet && payInEnrichment) {
          await tryCreditNoahBankOnrampPayInWallet(admin, {
            transactionId: upsert.transactionId,
            userId,
            businessId,
            noahTransactionId: id,
            ruleExecutionId,
            payInEnrichment,
            metadata,
            solanaTxHash: pickTxHash(txData),
          })
        }

        if (isGlobalPayoutSell && status === "settled" && upsert.transactionId) {
          await applyGlobalPayoutMarginReconciliation(admin, {
            txData,
            priorMetadata: metadata,
            transactionId: upsert.transactionId,
          })
          await applyGlobalPayoutChannelFeeReconciliation(admin, {
            txData,
            priorMetadata: metadata,
            transactionId: upsert.transactionId,
          })
        }

        if (
          isGlobalPayoutSell &&
          (status === "failed" || status === "cancelled") &&
          externalId
        ) {
          await reverseGlobalPayoutWalletDebitForEasnerPayoutId(admin, {
            easnerPayoutId: externalId,
          }).catch((e) => {
            console.warn("global_payout_failed_reversal:", e)
          })
          // Failed payout notice comes from upsertLedgerTransaction (becameFailed) — not a reversal email.
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
