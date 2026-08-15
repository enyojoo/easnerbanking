import {
  buildDraftRecipientId,
  countryCodeForRecipientSave,
  normalizeRecipientBankName,
  parseEasetagFromBankLabel,
  parseWalletDescriptorFromBankLabel,
  recipientIdentityFromUpsertInput,
  recipientIdentityKey,
} from '@easner/shared'
import type { Recipient } from '../types'
import type { RecipientData } from './recipientService'
import { buildDraftEasenetRecipient } from './draftEasenetRecipient'

export type DraftRecipientKind = 'easenet' | 'wallet' | 'mobile' | 'bank'

function upsertShapeFromRecipientData(data: RecipientData, kind: DraftRecipientKind) {
  const descriptor = parseWalletDescriptorFromBankLabel(data.bankName)
  return {
    recipientType: kind === 'easenet' ? ('easenet' as const) : kind,
    countryCode: data.countryCode,
    currency: data.currency,
    fullName: data.fullName,
    accountNumber: data.accountNumber,
    bankName: data.bankName,
    phoneNumber: data.phoneNumber,
    email: data.email,
    mobileProvider: data.mobileProvider,
    walletAsset: descriptor?.asset || data.currency,
    walletNetwork: data.walletNetwork || descriptor?.network,
    routingNumber: data.routingNumber,
    sortCode: data.sortCode,
    iban: data.iban,
    payeeEasetag:
      kind === 'easenet'
        ? parseEasetagFromBankLabel(data.bankName) || data.accountNumber
        : undefined,
  }
}

export function buildDraftRecipient(
  userId: string,
  data: RecipientData,
  kind: DraftRecipientKind,
): Recipient {
  if (kind === 'easenet') {
    const tag =
      parseEasetagFromBankLabel(data.bankName) ||
      String(data.accountNumber || '')
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
    return buildDraftEasenetRecipient({
      easetag: tag,
      fullName: data.fullName,
      avatarUrl: data.payeeAvatarUrl ?? null,
      userId,
      accountKind: data.payeeAccountKind,
    })
  }

  const bankName = normalizeRecipientBankName({
    recipientType: kind,
    mobileProvider: data.mobileProvider,
    walletAsset: data.currency,
    walletNetwork: data.walletNetwork,
    bankName: data.bankName,
  })
  const identity = recipientIdentityFromUpsertInput(
    upsertShapeFromRecipientData({ ...data, bankName }, kind),
  )
  const id = identity
    ? buildDraftRecipientId(recipientIdentityKey(identity))
    : `draft_recipient:${Date.now()}`
  const now = new Date().toISOString()
  const countryCode =
    countryCodeForRecipientSave({
      countryCode: data.countryCode,
      currencyCode: data.currency,
    }) || undefined

  return {
    id,
    user_id: userId,
    full_name: data.fullName,
    account_number: data.accountNumber,
    bank_name: bankName,
    phone_number: data.phoneNumber,
    email: data.email,
    currency: data.currency,
    country_code: countryCode,
    routing_number: data.routingNumber,
    sort_code: data.sortCode,
    iban: data.iban,
    swift_bic: data.swiftBic,
    transfer_type: data.transferType,
    checking_or_savings: data.checkingOrSavings,
    address_line1: data.addressLine1,
    city: data.city,
    state: data.state,
    postal_code: data.postalCode,
    mobile_provider: data.mobileProvider,
    wallet_network: data.walletNetwork,
    created_at: now,
    updated_at: now,
    payee_avatar_url: data.payeeAvatarUrl ?? undefined,
    payee_account_kind: data.payeeAccountKind,
  }
}
