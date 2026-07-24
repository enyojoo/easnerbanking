import type { ReceiptVisualRow } from '@easner/shared'

export type { ReceiptVisualRow }

export type ReceiptDetails = {
  title: string
  amountText: string
  isCredit: boolean
  statusLabel: string
  outcome: 'success' | 'failed'
  dateText: string
  rows: ReceiptVisualRow[]
  transactionId: string
}

/** @deprecated Plain rows — use ReceiptVisualRow via buildTransactionReceiptDetailRows. */
export type ReceiptRow = { label: string; value: string }
