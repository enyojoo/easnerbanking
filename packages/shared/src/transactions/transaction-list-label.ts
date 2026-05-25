/**
 * Consistent transaction row titles for mobile lists, business tables, and notifications.
 */

import { formatDisplayPersonName } from "../format-display-name"
import {
  deriveEasnerInboundRemitterDisplayName,
  isEasnerProductReceiveTitle,
  isEasnerProductSendTitle,
} from "./product-label"
import {
  ACCOUNT_VERIFICATION_LIST_LABEL,
  isVerificationDepositMetadata,
} from "./verification-deposit"

export type TransactionListLabelInput = {
  name?: string | null
  source_type?: string | null
  source_liquidation_address_id?: string | null
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  recipient_full_name?: string | null
}

/** Inbound row title (dashboard, transactions list). */
export function resolveInboundTransactionListLabel(input: TransactionListLabelInput): string {
  if (input.source_type === "liquidation_address" || input.source_liquidation_address_id) {
    return "Stablecoin Deposit"
  }

  if (isVerificationDepositMetadata(input.metadata)) {
    return ACCOUNT_VERIFICATION_LIST_LABEL
  }

  const apiName = String(input.name ?? "").trim()
  if (apiName === ACCOUNT_VERIFICATION_LIST_LABEL) return apiName
  if (apiName === "Stablecoin Deposit") return apiName

  if (apiName && !isEasnerProductReceiveTitle(apiName)) {
    return formatDisplayPersonName(apiName)
  }

  const remitter = deriveEasnerInboundRemitterDisplayName({
    metadata: input.metadata,
    payload: input.payload,
  })
  if (remitter) return remitter
  if (apiName && isEasnerProductReceiveTitle(apiName)) return apiName

  const fromRecipient = String(input.recipient_full_name ?? "").trim()
  if (fromRecipient) {
    return `Received from ${formatDisplayPersonName(fromRecipient)}`
  }
  return "Received"
}

/** Outbound row title. */
export function resolveOutboundTransactionListLabel(input: {
  name?: string | null
  recipient_full_name?: string | null
  metadata?: Record<string, unknown> | null
}): string {
  const apiName = String(input.name ?? "").trim()
  if (isEasnerProductSendTitle(apiName)) return apiName

  const toName = String(input.recipient_full_name ?? apiName).trim()
  if (!toName) return "Sent"

  // Global payout list rows show recipient name only (matches web + inbound deposits).
  if (String(input.metadata?.payout_type ?? "").toLowerCase() === "global_fiat") {
    return formatDisplayPersonName(toName) || toName
  }

  return `Sent to ${formatDisplayPersonName(toName)}`
}

export function resolveTransactionListLabel(
  transactionType: "receive" | "send" | string,
  input: TransactionListLabelInput,
): string {
  if (transactionType === "receive") return resolveInboundTransactionListLabel(input)
  if (transactionType === "send") return resolveOutboundTransactionListLabel(input)
  return String(input.name ?? "Transaction").trim() || "Transaction"
}
