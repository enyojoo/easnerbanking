import { buildYcQuoteKey } from "@/lib/yellowcard/quote-key"

export function buildPayoutQuoteKey(parts: {
  recipientId: string
  sourceBalanceCurrency: string
  amountEntryMode: "send" | "receive"
  receiveAmount: number
  sendBudget?: number
  note?: string
  paymentPurpose?: string
}): string {
  return buildYcQuoteKey({
    mode: "balance_payout",
    recipient_id: parts.recipientId,
    source: parts.sourceBalanceCurrency,
    entry_mode: parts.amountEntryMode,
    receive_amount: parts.receiveAmount,
    send_budget: parts.sendBudget ?? "",
    note: parts.note ?? "",
    payment_purpose: parts.paymentPurpose ?? "",
  })
}
