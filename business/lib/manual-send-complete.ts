import { createManualSendOrder } from "@/lib/manual-send-api"
import type { SendFlowState } from "@/lib/send-flow-session"

export async function completeManualSendFromSession(
  state: SendFlowState,
  options?: { receiptUrl?: string | null },
): Promise<{ transactionId: string; referenceCode: string }> {
  const pmId = state.manualPaymentMethodId
  const quote = state.manualQuote
  const recipientId = state.recipient?.id
  if (!pmId || !quote || !recipientId) {
    throw new Error("Missing manual send details")
  }
  return createManualSendOrder({
    recipientId,
    paymentMethodId: pmId,
    quote: {
      ...quote,
      fromCurrency: quote.fromCurrency,
      toCurrency: quote.toCurrency,
      direction: quote.direction,
      inputAmount: quote.inputAmount,
    },
    referenceCode: state.transactionId,
    receiptUrl: options?.receiptUrl ?? null,
  })
}
