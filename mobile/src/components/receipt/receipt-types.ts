export type ReceiptRow = { label: string; value: string }

export type ReceiptDetails = {
  title: string
  amountText: string
  isCredit: boolean
  statusLabel: string
  outcome: 'success' | 'failed'
  dateText: string
  rows: ReceiptRow[]
  transactionId: string
}
