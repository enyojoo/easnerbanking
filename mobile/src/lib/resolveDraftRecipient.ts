import { isDraftRecipientId } from '@easner/shared'
import type { QueryClient } from '@tanstack/react-query'
import type { Scope } from '@easner/shared'
import type { Recipient } from '../types'
import { upsertRecipientInListCache } from '../hooks/queries/use-recipients'
import { recipientService, type RecipientData } from './recipientService'

export function recipientDataFromDraft(recipient: Recipient): RecipientData | undefined {
  const tag = String(recipient.payee_easetag || '').trim().replace(/^@+/, '').toLowerCase()
  if (tag) {
    return {
      fullName: recipient.full_name,
      accountNumber: tag,
      bankName: `Easetag (@${tag})`,
      currency: 'USD',
      countryCode: 'US',
      payeeAvatarUrl: recipient.payee_avatar_url,
      payeeAccountKind: recipient.payee_account_kind,
    }
  }
  if (!recipient.account_number && !recipient.iban && !recipient.phone_number) return undefined
  return {
    fullName: recipient.full_name,
    accountNumber: recipient.account_number,
    bankName: recipient.bank_name,
    currency: recipient.currency,
    countryCode: recipient.country_code,
    phoneNumber: recipient.phone_number,
    email: recipient.email,
    mobileProvider: recipient.mobile_provider,
    walletNetwork: recipient.wallet_network,
    routingNumber: recipient.routing_number,
    sortCode: recipient.sort_code,
    iban: recipient.iban,
    swiftBic: recipient.swift_bic,
    transferType: recipient.transfer_type,
    checkingOrSavings: recipient.checking_or_savings,
    addressLine1: recipient.address_line1,
    city: recipient.city,
    state: recipient.state,
    postalCode: recipient.postal_code,
  }
}

export async function resolveDraftRecipient(
  userId: string,
  recipient: Recipient,
  persist?: RecipientData,
  cache?: { qc: QueryClient; scope: Scope | null },
): Promise<Recipient> {
  if (!isDraftRecipientId(recipient.id)) return recipient
  const payload = persist ?? recipientDataFromDraft(recipient)
  if (!payload) {
    throw new Error('Draft recipient is missing save payload.')
  }
  const saved = await recipientService.findOrCreate(userId, payload)
  if (cache?.qc) {
    upsertRecipientInListCache(cache.qc, cache.scope, userId, saved)
  }
  return saved
}
