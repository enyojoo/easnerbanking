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
  feeAmount?: number
  totalAmount?: number
  note: string
  /** Canada CAD — Noah PaymentPurpose (amount screen dropdown). */
  paymentPurpose?: string
  transactionId: string
  /** Which side of the FX pair the user typed on the amount screen. */
  amountEntryMode?: "send" | "receive"
  /** Executable Noah payout quote from confirm (Noah sell/prepare). */
  payoutQuote?: {
    /** Saved recipient this quote was priced for (must match `recipient.id` at authorize). */
    recipientId?: string
    receiveAmount: number
    sendAmount: number
    sendCurrency: string
    totalDebited: number
    /** Customer-facing destination per 1 source (`noah_rates.rate`). */
    midRate?: number
    noahFee: number
    noahFeeCurrency: string
    easnerFee: number
    easnerFeeCurrency: string
    formSessionId: string
    cryptoAuthorizedAmount: string
    cryptoCurrency: string
    channelId?: string
    pricingQuoteId?: string
    expiresAt: string
    noahFloor?: string
    noahSendAmount?: string
    marginAmount?: number
    channelCost?: number
    /** Explicit Easner 1% processing fee leg (uncapped). */
    processingFee?: number
    /** Channel component shown in the combined Processing fee row (foots with total). */
    displayChannelCost?: number
    customerPrincipal?: number
    marginCaptureMode?: "surplus_send" | "split_debit"
    noahMid?: number
    /** Merchant schedule fee at quote time (validation only). */
    scheduleFee?: number
    /** Noah prepare Breakdown ChannelFee when present. */
    prepareChannelFee?: number
    /** Ticket-sized Noah mid used for pricing at quote time. */
    quoteNoahMid?: number
    /** Payout rail when corridor routes to Yellowcard. */
    provider?: "noah" | "yellowcard"
    ycSequenceId?: string
    ycSendId?: string
    ycWalletAddress?: string
    ycCryptoAmount?: number
  }
  /** MoMo pay-in details collected before cross-border review (phone + network). */
  ycMomoSetup?: {
    sourcePhone: string
    networkId: string
    sourceNetworkName?: string
  }
  /** Yellowcard Through Local Currency pay-in session (cross-border). */
  ycCrossBorder?: {
    transferId: string
    transactionId: string
    easnerTransactionId?: string
    localPayIn: number
    customerRate: number
    provisionalPayIn?: number
    processingFee?: number
    bankInfo: Record<string, unknown> | null
    expiresAt: string
    payInNotice?: string
    payInRail?: "bank_transfer" | "mobile_money"
    displayProcessingFeeLocal?: number
    sourcePhone?: string
    sourceNetworkName?: string
  }
  /** Executable wallet send quote from confirm (Turnkey direct or LI.FI). */
  walletQuote?: {
    /** Saved recipient this quote was priced for (must match `recipient.id` at authorize). */
    recipientId?: string
    receiveAmount: number
    receiveCurrency: string
    receiveNetwork: string
    sendAmount: number
    sendCurrency: string
    totalDebited: number
    marginAmount: number
    channelCost: number
    processingFee?: number
    displayChannelCost?: number
    networkFee: number
    customerRate: number
    lifiMid: number
    formSessionId: string
    cryptoAuthorizedAmount: string
    cryptoCurrency: string
    pricingQuoteId: string
    expiresAt: string
    executionModel: "direct_turnkey" | "lifi_bridge"
    lifiFloor?: string
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
