import React from 'react'
import {
  resolveTransactionRecipientDisplay,
  type GlobalPayoutRecipientSnapshot,
  type TransactionRecipientDisplay,
} from '@easner/shared'
import { SendSelectedRecipientSummary } from '../send/SendSelectedRecipientSummary'
import { useEasenetRecipientHydration } from '../../hooks/useEasenetRecipientHydration'
import type { Recipient } from '../../types'

function toRecipient(display: TransactionRecipientDisplay): Recipient {
  const now = new Date().toISOString()
  const tag = display.payeeEasetag
  return {
    id: 'tx-recipient',
    user_id: '',
    full_name: display.fullName,
    account_number: display.accountNumber ?? tag ?? '',
    bank_name: display.bankName ?? (tag ? `Easetag (@${tag})` : ''),
    currency: display.currency ?? 'USD',
    country_code: display.countryCode,
    phone_number: display.phone,
    mobile_provider: display.mobileProvider,
    wallet_network: display.walletNetwork,
    payee_easetag: tag,
    created_at: now,
    updated_at: now,
  }
}

type Props = {
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  recipientName?: string | null
  counterpartyName?: string | null
  counterpartyAddress?: string | null
  destinationAddress?: string | null
  receiveNetwork?: string | null
  receiveCurrency?: string | null
  payeeEasetag?: string | null
  alignEnd?: boolean
}

/** Review-style recipient chip for transaction detail rows (flag, token, or Easetag avatar). */
export function TransactionRecipientSummary({
  recipientSnapshot,
  recipientName,
  counterpartyName,
  counterpartyAddress,
  destinationAddress,
  receiveNetwork,
  receiveCurrency,
  payeeEasetag,
  alignEnd = true,
}: Props) {
  const display = resolveTransactionRecipientDisplay({
    recipientSnapshot,
    recipientName,
    counterpartyName,
    counterpartyAddress,
    destinationAddress,
    receiveNetwork,
    receiveCurrency,
    payeeEasetag,
  })
  const recipient = display ? toRecipient(display) : null
  const easenetPreview = useEasenetRecipientHydration(recipient)

  if (!display || !recipient) return null

  return (
    <SendSelectedRecipientSummary
      recipient={recipient}
      easenetPreview={easenetPreview}
      alignEnd={alignEnd}
    />
  )
}
