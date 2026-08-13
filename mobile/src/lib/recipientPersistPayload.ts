import type { RecipientData } from './recipientService'
import { mergeRecipientProviderBindings } from './recipientCatalog'
import { mapCadRoutingToGridMetadata } from '@easner/shared'

export function applyCadRoutingToRecipientMetadata(input: {
  countryCode?: string | null
  currency?: string | null
  routingNumber?: string | null
  sortCode?: string | null
  metadata?: Record<string, unknown> | null
}): Record<string, unknown> {
  const cc = String(input.countryCode ?? '').trim().toUpperCase()
  const cur = String(input.currency ?? '').trim().toUpperCase()
  const metadata = input.metadata ?? {}
  if (cc !== 'CA' || cur !== 'CAD') return metadata
  return mapCadRoutingToGridMetadata({
    routingNumber: input.routingNumber,
    sortCode: input.sortCode,
    metadata,
  })
}

export function buildRecipientInsertPayload(
  userId: string,
  recipientData: RecipientData,
  bankNameForPersist: string,
  derivedSwiftBic: string | undefined,
  countryCode: string,
) {
  const rail = recipientData.mobileProvider ? ('mobile_money' as const) : ('bank_transfer' as const)
  const metadata =
    countryCode && recipientData.currency
      ? mergeRecipientProviderBindings({
          countryCode,
          currencyCode: recipientData.currency,
          rail,
          bankName: bankNameForPersist,
          mobileProvider: recipientData.mobileProvider,
          metadata: recipientData.metadata ?? {},
        })
      : (recipientData.metadata ?? {})

  const metadataWithCad = applyCadRoutingToRecipientMetadata({
    countryCode,
    currency: recipientData.currency,
    routingNumber: recipientData.routingNumber,
    sortCode: recipientData.sortCode,
    metadata,
  })

  return {
    user_id: userId,
    full_name: recipientData.fullName,
    account_number: recipientData.accountNumber,
    bank_name: bankNameForPersist,
    phone_number: recipientData.phoneNumber || null,
    email: recipientData.email || null,
    currency: recipientData.currency,
    country_code: countryCode || null,
    routing_number: recipientData.routingNumber || null,
    sort_code: recipientData.sortCode || null,
    iban: recipientData.iban || null,
    swift_bic: derivedSwiftBic || null,
    transfer_type: recipientData.transferType || null,
    checking_or_savings: recipientData.checkingOrSavings || null,
    address_line1: recipientData.addressLine1 || null,
    city: recipientData.city || null,
    state: recipientData.state || null,
    postal_code: recipientData.postalCode || null,
    mobile_provider: recipientData.mobileProvider || null,
    wallet_network: recipientData.walletNetwork || null,
    metadata: metadataWithCad,
  }
}
