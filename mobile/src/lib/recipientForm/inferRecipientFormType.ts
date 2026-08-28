import type { Recipient } from '../../types'
import type { RecipientFormType } from './recipientFormTypes'

export function inferRecipientFormType(recipient: Recipient): RecipientFormType {
  const bankNameRaw = String(recipient.bank_name || '')
  const bank = bankNameRaw.toLowerCase()
  if (bank.includes('wallet')) return 'wallet'
  if (bank.includes('mobile money')) return 'mobile'
  if (bank.includes('easenet') || bank.includes('easetag')) return 'easenet'
  return 'bank'
}
