/**
 * Rich receipt detail rows — flags, recipient avatars, balance chips.
 * Emails stay plain via `buildTransactionEmailDetailRows`.
 */

import { currencyToCountryCode } from "../flags/currency-mapping"
import { REVIEW_ROW_LABELS } from "../review-row-labels"
import type { GlobalPayoutRecipientSnapshot } from "./global-payout-types"
import type { InboundReceiveDetailSnapshot } from "./inbound-receive-detail"
import { buildInboundReceiveDetailRows } from "./inbound-receive-detail"
import {
  buildTransactionEmailDetailRows,
  filterTransactionReceiptDetailRows,
  type TransactionEmailDetailInput,
} from "./transaction-email-detail-rows"
import {
  resolveTransactionRecipientDisplay,
  type TransactionRecipientDisplay,
} from "./transaction-recipient-display"

export type ReceiptTextRow = { kind: "text"; label: string; value: string }

export type ReceiptRecipientRow = {
  kind: "recipient"
  label: string
  display: TransactionRecipientDisplay
}

export type ReceiptBalanceDestinationRow = {
  kind: "balanceDestination"
  label: string
  currency: string
  balanceLabel: string
}

export type ReceiptVisualRow = ReceiptTextRow | ReceiptRecipientRow | ReceiptBalanceDestinationRow

export type TransactionReceiptDetailInput = TransactionEmailDetailInput & {
  payeeEasetag?: string | null
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  counterpartyName?: string | null
  counterpartyAddress?: string | null
  destinationAddress?: string | null
}

const RECEIPT_OMITTED_INBOUND: ReadonlySet<string> = new Set([
  REVIEW_ROW_LABELS.exchangeRate,
  REVIEW_ROW_LABELS.narration,
])

export function parseBalanceLabelCurrency(balanceLabel: string): string {
  const match = String(balanceLabel ?? "")
    .trim()
    .match(/^([A-Z]{3})\b/i)
  if (match?.[1]) return match[1].toUpperCase()
  return "USD"
}

/** Flag asset path segment for hosted `/flags/{code}.png` assets. */
export function resolveReceiptCurrencyFlagCode(currency: string): string {
  const cur = String(currency ?? "").trim().toUpperCase()
  if (cur === "EUR") return "eu"
  const cc = currencyToCountryCode[cur]
  return cc ? cc.toLowerCase() : "us"
}

function resolveRecipientDisplay(input: TransactionReceiptDetailInput): TransactionRecipientDisplay | null {
  return resolveTransactionRecipientDisplay({
    recipientSnapshot: input.recipientSnapshot,
    recipientName: input.recipient?.fullName ?? null,
    counterpartyName: input.counterpartyName ?? input.recipient?.fullName ?? null,
    counterpartyAddress: input.counterpartyAddress ?? input.recipient?.accountNumber ?? null,
    destinationAddress: input.destinationAddress,
    receiveNetwork: input.receiveNetwork,
    receiveCurrency: input.payoutReview?.receive_currency ?? null,
    payeeEasetag: input.payeeEasetag,
  })
}

function toBalanceDestinationRow(label: string, value: string, currency?: string): ReceiptBalanceDestinationRow {
  const balanceLabel = String(value ?? "").trim()
  return {
    kind: "balanceDestination",
    label,
    currency: currency ?? parseBalanceLabelCurrency(balanceLabel),
    balanceLabel,
  }
}

function inboundRowsToVisual(
  snapshot: InboundReceiveDetailSnapshot,
): ReceiptVisualRow[] {
  return buildInboundReceiveDetailRows(snapshot, { surface: "receipt" })
    .filter((row) => !row.isVerificationHint)
    .filter((row) => !RECEIPT_OMITTED_INBOUND.has(row.label))
    .map((row) => {
      if (
        row.creditCurrency &&
        (row.label === REVIEW_ROW_LABELS.creditTo || row.label === REVIEW_ROW_LABELS.creditFor)
      ) {
        return toBalanceDestinationRow(row.label, row.value, row.creditCurrency)
      }
      return { kind: "text", label: row.label, value: row.value }
    })
}

/** Rich receipt rows for mobile PNG + business PDF (not email). */
export function buildTransactionReceiptDetailRows(
  input: TransactionReceiptDetailInput,
): ReceiptVisualRow[] {
  if (input.inboundReceive) {
    if (input.inboundReceive.kind === "easetag_receive") return []
    return inboundRowsToVisual(input.inboundReceive)
  }

  const recipientDisplay = resolveRecipientDisplay(input)
  const emailInput: TransactionEmailDetailInput = {
    ...input,
    recipient:
      input.recipient ??
      (recipientDisplay
        ? {
            fullName: recipientDisplay.fullName,
            bankName: recipientDisplay.bankName,
            accountNumber: recipientDisplay.accountNumber,
            phone: recipientDisplay.phone,
            mobileProvider: recipientDisplay.mobileProvider,
            walletNetwork: recipientDisplay.walletNetwork,
          }
        : null),
  }
  const plain = filterTransactionReceiptDetailRows(buildTransactionEmailDetailRows(emailInput))

  return plain.map((row) => {
    if (row.label === REVIEW_ROW_LABELS.recipient && recipientDisplay) {
      return { kind: "recipient", label: row.label, display: recipientDisplay }
    }
    if (row.label === REVIEW_ROW_LABELS.debitedFrom) {
      return toBalanceDestinationRow(
        row.label,
        row.value,
        input.payoutReview?.send_currency ?? undefined,
      )
    }
    if (row.label === REVIEW_ROW_LABELS.creditTo || row.label === REVIEW_ROW_LABELS.creditFor) {
      return toBalanceDestinationRow(row.label, row.value)
    }
    return { kind: "text", label: row.label, value: row.value }
  })
}

/** Plain `{ label, value }` rows for legacy receipt callers/tests. */
export function receiptVisualRowsToPlain(rows: ReceiptVisualRow[]): { label: string; value: string }[] {
  return rows.map((row) => {
    if (row.kind === "recipient") {
      const tag = row.display.payeeEasetag ? `@${row.display.payeeEasetag}` : ""
      return { label: row.label, value: tag ? `${row.display.fullName} (${tag})` : row.display.fullName }
    }
    if (row.kind === "balanceDestination") {
      return { label: row.label, value: row.balanceLabel }
    }
    return { label: row.label, value: row.value }
  })
}
