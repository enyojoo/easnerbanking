import type {
  GlobalPayoutRecipientSnapshot,
  GlobalPayoutReviewSnapshot,
} from '@easner/shared'
import { buildDraftEasenetRecipient } from './draftEasenetRecipient'
import { resolveRecipientEasetagForUi } from './easenetRecipientUi'
import type { Recipient } from '../types'

export type SendAgainTransactionInput = {
  transaction_type?: string
  source_type?: string
  recipient_name?: string
  name?: string
  amount?: number
  display_amount?: number
  ledger_amount?: number
  metadata?: Record<string, unknown> | null
  recipient_snapshot?: GlobalPayoutRecipientSnapshot | null
  recipient_id?: string
  payout_review?: GlobalPayoutReviewSnapshot | null
}

export type SendAgainAmountPrefill = {
  /** Formatted for the send amount keypad (commas, up to 2 decimals). */
  keypadAmount: string
  amountEntryMode: 'receive' | 'send'
}

/** Format a numeric amount for the send amount keypad input. */
export function formatSendAgainKeypadAmount(amount: number): string {
  const rounded = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100
  if (rounded <= 0) return '0'

  const fractional = Math.abs(rounded - Math.trunc(rounded))
  const raw =
    fractional >= 0.01 ? rounded.toFixed(2).replace(/\.?0+$/, '') : String(Math.trunc(rounded))

  const hasDot = raw.includes('.')
  const [rawInteger = '0', rawDecimal = ''] = raw.split('.')
  const normalizedInteger = rawInteger.replace(/^0+(?=\d)/, '') || '0'
  const formattedInteger = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (!hasDot) return formattedInteger
  return `${formattedInteger}.${rawDecimal.slice(0, 2)}`
}

/**
 * Amount to prefill on Send Amount when repeating a send (keypad uses receive mode by default).
 */
export function resolveSendAgainAmountPrefill(
  transaction: SendAgainTransactionInput,
): SendAgainAmountPrefill | null {
  if (transaction.transaction_type !== 'send') return null

  const review = transaction.payout_review
  const receiveAmount = Number(review?.receive_amount)
  if (Number.isFinite(receiveAmount) && receiveAmount > 0) {
    return {
      keypadAmount: formatSendAgainKeypadAmount(receiveAmount),
      amountEntryMode: 'receive',
    }
  }

  const fallback = Number(
    transaction.display_amount ?? transaction.amount ?? transaction.ledger_amount,
  )
  if (!Number.isFinite(fallback) || fallback <= 0) return null

  return {
    keypadAmount: formatSendAgainKeypadAmount(fallback),
    amountEntryMode: 'receive',
  }
}

function normalizeAccount(value: string | undefined | null): string {
  return String(value || '').replace(/\s+/g, '').toLowerCase()
}

function transactionMetadata(
  transaction: SendAgainTransactionInput,
): Record<string, unknown> {
  const raw = transaction.metadata
  return raw && typeof raw === 'object' ? raw : {}
}

function recipientIdFromTransaction(transaction: SendAgainTransactionInput): string {
  const meta = transactionMetadata(transaction)
  return String(transaction.recipient_id || meta.recipient_id || '').trim()
}

function isEasetagP2pTransaction(transaction: SendAgainTransactionInput): boolean {
  const meta = transactionMetadata(transaction)
  return (
    transaction.source_type === 'easetag_p2p' ||
    String(meta.source || '').toLowerCase() === 'easetag_p2p'
  )
}

function matchRecipientFromSnapshot(
  snapshot: GlobalPayoutRecipientSnapshot,
  recipients: Recipient[],
): Recipient | null {
  const snapAcct = normalizeAccount(snapshot.account_number)
  const snapPhone = normalizeAccount(snapshot.phone)
  const snapName = String(snapshot.full_name || '').trim().toLowerCase()

  const byAccount = recipients.filter((r) => {
    const values = [r.account_number, r.iban, r.phone_number].map(normalizeAccount).filter(Boolean)
    if (snapAcct && values.some((v) => v === snapAcct)) return true
    if (snapPhone && normalizeAccount(r.phone_number) === snapPhone) return true
    return false
  })

  if (byAccount.length === 1) return byAccount[0]!
  if (byAccount.length > 1 && snapName) {
    const narrowed = byAccount.filter((r) => r.full_name.trim().toLowerCase() === snapName)
    if (narrowed.length === 1) return narrowed[0]!
  }
  if (byAccount.length > 0) return byAccount[0]!

  if (snapName) {
    const byName = recipients.filter((r) => r.full_name.trim().toLowerCase() === snapName)
    if (byName.length === 1) return byName[0]!
  }

  return null
}

function resolveEasetagRecipient(
  transaction: SendAgainTransactionInput,
  recipients: Recipient[],
  userId: string,
): Recipient | null {
  const meta = transactionMetadata(transaction)
  const tag = String(meta.payee_easetag || meta.recipient_easetag || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
  if (!tag) return null

  const saved = recipients.find((r) => resolveRecipientEasetagForUi(r) === tag)
  if (saved) return saved

  const displayName =
    String(transaction.recipient_name || transaction.name || '').trim() || tag
  return buildDraftEasenetRecipient({
    easetag: tag,
    fullName: displayName,
    userId,
  })
}

/**
 * Resolve a saved (or draft Easetag) recipient from a completed send transaction
 * so "Send again" can open Send Amount with the counterparty pre-selected.
 */
export function resolveSendAgainRecipient(
  transaction: SendAgainTransactionInput,
  recipients: Recipient[],
  userId: string,
): Recipient | null {
  if (transaction.transaction_type !== 'send') return null

  const recipientId = recipientIdFromTransaction(transaction)
  if (recipientId) {
    const byId = recipients.find((r) => r.id === recipientId)
    if (byId) return byId
  }

  if (isEasetagP2pTransaction(transaction)) {
    return resolveEasetagRecipient(transaction, recipients, userId)
  }

  const snapshot = transaction.recipient_snapshot
  if (snapshot) {
    return matchRecipientFromSnapshot(snapshot, recipients)
  }

  return null
}
