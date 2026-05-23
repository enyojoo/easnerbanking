import type { SupabaseClient } from "@supabase/supabase-js"
import type { OrderAmounts } from "@easner/shared"
import { generateTransactionId } from "@/lib/transaction-id"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"

export type ManualSendQuoteSnapshot = OrderAmounts & {
  fromCurrency: string
  toCurrency: string
  direction: "send" | "receive"
  inputAmount: number
}

export type CreateManualSendOrderInput = {
  userId: string
  businessId?: string | null
  recipientId: string
  paymentMethodId: string
  quote: ManualSendQuoteSnapshot
  paymentMethodSnapshot: Record<string, unknown>
  receiptUrl?: string | null
  referenceCode?: string
}

export async function createManualSendOrder(
  admin: SupabaseClient,
  input: CreateManualSendOrderInput,
): Promise<{ transactionId: string; referenceCode: string }> {
  const referenceCode = input.referenceCode?.trim() || generateTransactionId()
  const { quote } = input

  const metadata: Record<string, unknown> = {
    easner_transaction_id: referenceCode,
    manual_send: true,
    flow: "through_another_currency",
    recipient_id: input.recipientId,
    payment_method_id: input.paymentMethodId,
    payment_method_snapshot: input.paymentMethodSnapshot,
    quote_snapshot: quote,
    receipt_url: input.receiptUrl ?? null,
    reference_code: referenceCode,
    receive_currency: quote.toCurrency,
    send_currency: quote.fromCurrency,
    receive_amount: quote.receiveAmount,
    fee_amount: quote.feeAmount,
    fee_type: quote.feeType,
    total_amount: quote.totalAmount,
    exchange_rate: quote.exchangeRate,
  }

  const result = await upsertLedgerTransaction(admin, {
    userId: input.userId,
    businessId: input.businessId ?? null,
    provider: "manual_send",
    providerTransactionId: referenceCode,
    status: "pending",
    amount: quote.totalAmount,
    currency: quote.fromCurrency,
    direction: "out",
    metadata,
    payload: {
      type: "manual_send_order",
      recipientId: input.recipientId,
      paymentMethodId: input.paymentMethodId,
    },
    baseCurrency: quote.fromCurrency,
    occurredAt: new Date().toISOString(),
  })

  return { transactionId: result.transactionId, referenceCode }
}
