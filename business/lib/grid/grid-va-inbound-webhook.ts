import type { SupabaseClient } from "@supabase/supabase-js"
import {
  classifyVerificationDepositFromFiatDeposit,
  formatVerificationBankDisplayName,
} from "@easner/shared"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { extractGridVaInboundSharedFields } from "./grid-va-inbound-fields"
import { gridWebhookCustomerId, gridWebhookTransactionId } from "./webhook-event-id"
import type { GridWebhookEvent } from "./types"
import {
  extractGridOnChainTxHash,
  resolveGridVaInboundWalletCredit,
} from "./webhook-amount"
import {
  reconcileGridVaBankDepositCreditForSolanaTx,
  tryCreditGridVaBankDepositWallet,
} from "./grid-bank-deposit-credit"

function webhookData(event: GridWebhookEvent): Record<string, unknown> | undefined {
  return event.data && typeof event.data === "object"
    ? (event.data as Record<string, unknown>)
    : undefined
}

function eventType(event: GridWebhookEvent): string {
  return String(event.eventType ?? event.type ?? "").trim().toUpperCase()
}

function isTerminalIncomingSuccess(event: GridWebhookEvent, status: string): boolean {
  const type = eventType(event)
  const normalized = status.toUpperCase()
  return (
    type.includes("INCOMING_PAYMENT.COMPLETED") ||
    (type.includes("INCOMING") && normalized.includes("COMPLETED")) ||
    normalized === "SETTLED"
  )
}

async function resolveBusinessSubject(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ businessId: string; userId: string } | null> {
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("grid_customer_id", customerId)
    .maybeSingle()
  if (!biz?.id) return null
  const businessId = String(biz.id)
  const userId = await resolveBusinessOrgOwnerUserId(admin, businessId)
  return { businessId, userId }
}

/**
 * Quote-less Grid INCOMING to a business VA: shared VA funding or verification product.
 */
export async function handleGridVaInboundDepositWebhook(
  admin: SupabaseClient,
  input: { event: GridWebhookEvent },
): Promise<{ handled: boolean }> {
  const data = webhookData(input.event)
  if (!data) return { handled: false }

  const customerId = gridWebhookCustomerId(data)
  if (!customerId) return { handled: false }

  const subject = await resolveBusinessSubject(admin, customerId)
  if (!subject) return { handled: false }

  const status = String(data.status ?? "").trim()
  if (!isTerminalIncomingSuccess(input.event, status)) return { handled: true }

  const credit = resolveGridVaInboundWalletCredit(data)
  if (!credit) return { handled: false }

  const gridTransactionId = gridWebhookTransactionId(data)
  if (!gridTransactionId) return { handled: false }

  const depositKind = classifyVerificationDepositFromFiatDeposit({
    fiatAmount: credit.fiatAmount,
  })
  const isVerification = depositKind === "verification"
  const fields = extractGridVaInboundSharedFields(data)
  const solanaTxHash = extractGridOnChainTxHash(data)
  const occurredAt = String(
    data.settledAt ?? data.updatedAt ?? data.createdAt ?? new Date().toISOString(),
  ).trim()
  const verificationBankName = isVerification
    ? formatVerificationBankDisplayName(fields.senderName) || fields.senderName || null
    : null

  const metadata: Record<string, unknown> = {
    flow: "bank_onramp",
    payout_provider: "grid",
    grid_va_inbound: true,
    grid_transaction_id: gridTransactionId,
    grid_customer_id: customerId,
    fiat_deposit_amount: credit.fiatAmount,
    fiat_deposit_currency: credit.fiatCurrency,
    settled_stablecoin_amount: isVerification ? 0 : credit.amount,
    wallet_ledger_currency: credit.ledgerCurrency,
    posted_amount: credit.fiatAmount,
    posted_currency: credit.fiatCurrency,
    fee_amount: fields.feeAmount,
    sender_name: fields.senderName || undefined,
    source_payment_rail: fields.sourcePaymentRail,
    deposit_scheme_label: fields.depositSchemeLabel,
    ...(fields.narration ? { narration: fields.narration, reference: fields.narration } : {}),
    source: "grid_webhook_incoming",
    ...(solanaTxHash ? { grid_on_chain_tx_hash: solanaTxHash } : {}),
    ...(isVerification
      ? {
          deposit_kind: "verification",
          verification_bank_name: verificationBankName,
        }
      : { deposit_kind: "funding" }),
  }

  const { transactionId } = await upsertLedgerTransaction(admin, {
    userId: subject.userId,
    businessId: subject.businessId,
    provider: "grid",
    providerTransactionId: gridTransactionId,
    status: "settled",
    amount: isVerification ? credit.fiatAmount : credit.amount,
    currency: isVerification ? credit.fiatCurrency : credit.ledgerCurrency,
    direction: "in",
    payload: data,
    metadata,
    occurredAt,
    settledAt: occurredAt,
    baseCurrency: isVerification ? credit.fiatCurrency : credit.ledgerCurrency,
    asset: isVerification ? credit.fiatCurrency : credit.ledgerCurrency === "EUR" ? "EURC" : "USDC",
    txHash: isVerification ? undefined : solanaTxHash,
  })

  if (isVerification) {
    return { handled: true }
  }

  if (solanaTxHash) {
    await reconcileGridVaBankDepositCreditForSolanaTx(admin, {
      solanaTxHash,
      userId: subject.userId,
      businessId: subject.businessId,
      inboundAmount: credit.amount,
      ledgerCurrency: credit.ledgerCurrency,
    })
    return { handled: true }
  }

  await tryCreditGridVaBankDepositWallet(admin, {
    transactionId,
    userId: subject.userId,
    businessId: subject.businessId,
    gridTransactionId,
    creditAmount: credit.amount,
    ledgerCurrency: credit.ledgerCurrency,
    solanaTxHash: null,
    onChainSettledAt: occurredAt,
  })

  const { startGridVaTurnkeySweepFromInbound } = await import("./va-turnkey-sweep")
  await startGridVaTurnkeySweepFromInbound(admin, {
    event: input.event,
    ledgerTransactionId: transactionId,
  }).catch((e) => {
    console.warn("[grid] va turnkey sweep enqueue failed:", e instanceof Error ? e.message : e)
  })

  return { handled: true }
}
