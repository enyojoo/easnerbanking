import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { generateTransactionId } from "@/lib/transaction-id"
import type { OtherCurrencyCode, PaymentMethodCode } from "@/lib/send-payment-methods"

export const SEND_FLOW_STATE_KEY = "send_flow_state"

/** Warm-cache for easetag ledger ETID reserved on /send (no blocking Continue). */
export const SEND_FLOW_LEDGER_ETID_CACHE_KEY = "send_flow_ledger_etid_cache"

export interface SendFlowLedgerEtidCache {
  transactionId: string
  ledgerReserveNoahScope: "business" | "individual"
  /** Profile `businessId` when cached; empty string if absent (individual). */
  businessIdKey: string
  /** Stable key for current recipient (easetag P2P). */
  recipientReserveKey: string
}

export function readSendFlowLedgerEtidCache(): SendFlowLedgerEtidCache | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(SEND_FLOW_LEDGER_ETID_CACHE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as SendFlowLedgerEtidCache
    if (!v || typeof v.transactionId !== "string") return null
    return v
  } catch {
    return null
  }
}

export function writeSendFlowLedgerEtidCache(v: SendFlowLedgerEtidCache): void {
  if (typeof window === "undefined") return
  sessionStorage.setItem(SEND_FLOW_LEDGER_ETID_CACHE_KEY, JSON.stringify(v))
}

export function clearSendFlowLedgerEtidCache(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem(SEND_FLOW_LEDGER_ETID_CACHE_KEY)
}

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
  /** Set when server reserves ETID for easetag ledger P2P (must match easetag-transfer scope). */
  ledgerReserveNoahScope?: "business" | "individual"
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
