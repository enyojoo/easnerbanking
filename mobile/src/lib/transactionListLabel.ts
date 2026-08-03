import {
  isEasnerProductReceiveTitle,
  isVerificationDepositMetadata,
  resolveInboundTransactionListLabel,
  resolveTransactionListLabel,
  VERIFICATION_DEPOSIT_LIST_LABEL,
} from '@easner/shared'

export type TransactionListRow = {
  name?: string | null
  display_description?: string | null
  transaction_type?: string | null
  type?: string | null
  source_type?: string | null
  source_liquidation_address_id?: string | null
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  recipient?: { full_name?: string | null } | null
  sender_display_name?: string | null
}

export function resolveTransactionRowType(row: TransactionListRow): string {
  return row.transaction_type || row.type || 'send'
}

/** Shared list-row title for Home recent activity and Transactions tab. */
export function getTransactionListName(row: TransactionListRow): string {
  const transactionType = resolveTransactionRowType(row)
  if (String(row.metadata?.product ?? "").toLowerCase() === 'payroll') {
    const businessName = String(row.metadata?.payroll_business_name ?? '').trim()
    return businessName ? `Payment from ${businessName}` : 'Payroll payment'
  }

  if (transactionType === 'card_funding') {
    return 'Card Top-Up'
  }

  if (transactionType === 'receive') {
    if (isVerificationDepositMetadata(row.metadata)) {
      return VERIFICATION_DEPOSIT_LIST_LABEL
    }
    const senderDisplay = String(row.sender_display_name ?? '').trim()
    const apiName = String(row.name ?? '').trim()
    if (senderDisplay && !isEasnerProductReceiveTitle(senderDisplay)) return senderDisplay
    if (apiName && !isEasnerProductReceiveTitle(apiName)) return apiName
    return resolveInboundTransactionListLabel({
      name: row.name,
      source_type: row.source_type,
      source_liquidation_address_id: row.source_liquidation_address_id,
      metadata: row.metadata,
      payload: row.payload,
    })
  }

  if (transactionType === 'send') {
    const displayDescription = String(row.display_description ?? '').trim()
    if (displayDescription) return displayDescription.replace(/^Transfer to\s+/i, '')
  }

  return resolveTransactionListLabel(transactionType, {
    name: row.name,
    source_type: row.source_type,
    source_liquidation_address_id: row.source_liquidation_address_id,
    metadata: row.metadata,
    payload: row.payload,
    recipient_full_name: row.recipient?.full_name,
  }).replace(/^Transfer to\s+/i, '')
}
