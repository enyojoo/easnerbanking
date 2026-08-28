import type { Recipient } from '../../types'
import { getAllCountryCurrencies, type CountryCurrency } from '../countryCurrencyMapping'
import {
  buildRecipientCatalogForType,
  type RecipientType,
} from '../recipientCatalog'
import { parseEurBankTransferType, parseUsBankTransferType } from '@easner/shared'
import type { EasenetProfilePreview, RecipientFormType, RecipientFormValues } from './recipientFormTypes'
import { emptyRecipientFormValues, recipientTypeKeyForForm } from './recipientFormTypes'

import { inferRecipientFormType } from './inferRecipientFormType'
  recipient: Recipient,
  inferredType: RecipientFormType,
  catalog: ReturnType<typeof buildRecipientCatalogForType>,
): CountryCurrency | null {
  const recipientTypeKey = recipientTypeKeyForForm(inferredType)
  const catalogMatch =
    catalog(recipientTypeKey).find(
      (cc) =>
        cc.currencyCode === recipient.currency &&
        (!recipient.country_code || cc.countryCode === recipient.country_code),
    ) ||
    catalog(recipientTypeKey).find((cc) => cc.currencyCode === recipient.currency) ||
    null
  if (catalogMatch) {
    return {
      countryCode: catalogMatch.countryCode,
      countryName: catalogMatch.countryName,
      currencyCode: catalogMatch.currencyCode,
      currencyName: catalogMatch.currencyName,
      flagEmoji: '',
    }
  }
  return getAllCountryCurrencies().find((cc) => cc.currencyCode === recipient.currency) || null
}

function parseTransferTypeForRecipient(
  recipient: Recipient,
  countryCurrency: CountryCurrency | null,
): string | null {
  if (countryCurrency?.countryCode === 'US') {
    return parseUsBankTransferType(recipient.transfer_type)
  }
  if (recipient.currency === 'EUR') {
    return parseEurBankTransferType(recipient.transfer_type)
  }
  return null
}

function buildEasenetProfileFromRecipient(recipient: Recipient): EasenetProfilePreview | null {
  const tag = String(recipient.payee_easetag || recipient.account_number || '')
    .trim()
    .replace(/^@+/, '')
  if (!tag) return null
  return {
    easetag: tag,
    fullName: recipient.full_name,
    avatarUrl: recipient.payee_avatar_url || null,
    accountKind: recipient.payee_account_kind === 'business' ? 'business' : 'personal',
  }
}

export function hydrateRecipientFormValues(recipient: Recipient): {
  values: RecipientFormValues
  inferredType: RecipientFormType
  countryCurrency: CountryCurrency | null
  transferType: string | null
  easenetProfile: EasenetProfilePreview | null
} {
  const inferredType = inferRecipientFormType(recipient)
  const bankNameRaw = String(recipient.bank_name || '')
  const walletMatch = bankNameRaw.match(/^Wallet \((.*)\)$/i)
  const walletDescriptor = walletMatch?.[1] || ''
  const [walletAssetFromBank, walletNetworkFromBank] = walletDescriptor.includes('/')
    ? walletDescriptor.split('/')
    : [undefined, walletDescriptor || undefined]
  const mobileMatch = bankNameRaw.match(/^Mobile Money \((.*)\)$/i)
  const mobileInner = mobileMatch?.[1] || ''
  const ccIdx = mobileInner.lastIndexOf('|CC:')
  const providerFromBank = (ccIdx >= 0 ? mobileInner.slice(0, ccIdx) : mobileInner).trim()
  const metadata = recipient.metadata as Record<string, unknown> | undefined

  const catalog = (type: RecipientType) =>
    buildRecipientCatalogForType(type, {
      bank: [],
      mobile: [],
      crypto: [],
    })
  const countryCurrency = resolveCountryCurrencyForRecipient(recipient, inferredType, catalog)

  return {
    inferredType,
    countryCurrency,
    transferType: parseTransferTypeForRecipient(recipient, countryCurrency),
    easenetProfile: inferredType === 'easenet' ? buildEasenetProfileFromRecipient(recipient) : null,
    values: {
      ...emptyRecipientFormValues(),
      fullName: recipient.full_name,
      accountNumber: recipient.account_number || '',
      bankName: recipient.bank_name || '',
      currency: (inferredType === 'wallet' ? walletAssetFromBank || recipient.currency : recipient.currency) || '',
      routingNumber: recipient.routing_number || '',
      sortCode: recipient.sort_code || '',
      iban: recipient.iban || '',
      swiftBic: recipient.swift_bic || '',
      phoneNumber:
        recipient.phone_number || (inferredType === 'mobile' ? recipient.account_number || '' : ''),
      provider: recipient.mobile_provider || (inferredType === 'mobile' ? providerFromBank : '') || '',
      walletAddress: recipient.account_number || '',
      network: recipient.wallet_network || (inferredType === 'wallet' ? walletNetworkFromBank || '' : ''),
      checkingOrSavings: recipient.checking_or_savings || '',
      addressLine1: recipient.address_line1 || '',
      city: recipient.city || '',
      state: recipient.state || '',
      postalCode: recipient.postal_code || '',
      email: recipient.email || '',
      payeeEasetag: (
        recipient.payee_easetag ||
        (inferredType === 'easenet' ? recipient.account_number : '') ||
        ''
      ).replace(/^@+/, ''),
      ycPixKeyType: String(metadata?.pix_key_type ?? ''),
      ycTaxId: String(metadata?.tax_id ?? ''),
      ycCuit: String(metadata?.cuit ?? ''),
      ycIdentificationType: String(metadata?.identification_type ?? ''),
      ycIdentificationNumber: String(metadata?.identification_number ?? ''),
      ycAccountType: String(metadata?.account_type ?? ''),
      ycIfsc: String(metadata?.ifsc ?? ''),
      ycBankCode: String(metadata?.bank_code ?? ''),
      ycBranchCode: String(metadata?.branch_code ?? ''),
      ycGridRegion: String(metadata?.grid_region ?? ''),
    },
  }
}
