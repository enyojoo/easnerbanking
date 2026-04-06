import type { Beneficiary } from "@/lib/recipient-types"
import { generateTransactionId } from "@/lib/transaction-id"
import type { OtherCurrencyCode, PaymentMethodCode } from "@/lib/send-payment-methods"

export const SEND_FLOW_STATE_KEY = "send_flow_state"

/** Shape stored in sessionStorage for the send money flow (amount step through confirm / authorize). */
export interface SendFlowState {
  recipient: Beneficiary
  amount: number
  receiveCurrency: string
  sendAmount: number
  sendCurrency: string
  sourceAccountId?: string
  paymentMethod: PaymentMethodCode
  otherCurrency?: OtherCurrencyCode | "STABLECOIN"
  otherPaymentMethod?: string
  note: string
  transactionId: string
}

/** Pre-fill send flow with a recipient (e.g. from Settings → Recipients); user finishes amount and source on /send. */
export function createSendFlowSeedForRecipient(recipient: Beneficiary): SendFlowState {
  const cur = recipient.currency || "USD"
  return {
    recipient,
    amount: 0,
    receiveCurrency: cur,
    sendAmount: 0,
    sendCurrency: cur,
    paymentMethod: "balance",
    note: "",
    transactionId: generateTransactionId(),
  }
}

export function persistSendFlowState(state: SendFlowState): void {
  if (typeof window === "undefined") return
  sessionStorage.setItem(SEND_FLOW_STATE_KEY, JSON.stringify(state))
}
