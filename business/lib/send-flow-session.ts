import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
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
  /** Selected `payment_methods.id` for manual through-another-currency flow. */
  manualPaymentMethodId?: string
  manualQuote?: {
    sendAmount: number
    receiveAmount: number
    exchangeRate: number
    feeAmount: number
    feeType: string
    totalAmount: number
    fromCurrency: string
    toCurrency: string
    direction: "send" | "receive"
    inputAmount: number
  }
  feeAmount?: number
  totalAmount?: number
  note: string
  /** Canada CAD — Noah PaymentPurpose (amount screen dropdown). */
  paymentPurpose?: string
  transactionId: string
  /** Executable Noah payout quote from confirm (Noah sell/prepare). */
  payoutQuote?: {
    receiveAmount: number
    sendAmount: number
    sendCurrency: string
    totalDebited: number
    /** Mid-market destination per 1 source (`/prices` `Rate`). */
    midRate?: number
    noahFee: number
    noahFeeCurrency: string
    easnerFee: number
    easnerFeeCurrency: string
    formSessionId: string
    cryptoAuthorizedAmount: string
    cryptoCurrency: string
    pricingQuoteId?: string
    expiresAt: string
  }
}

/** Pre-fill send flow with a recipient (e.g. from Settings → Recipients); user finishes amount and source on /send. */
export function createSendFlowSeedForRecipient(recipient: Beneficiary): SendFlowState {
  const normalized = coerceBeneficiaryEasenetDisplay(recipient)
  const cur = normalized.currency || "USD"
  return {
    recipient: normalized,
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
