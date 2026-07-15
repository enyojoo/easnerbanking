import type { RecipientData } from './recipientService'

export function buildRecipientInsertPayload(
  userId: string,
  recipientData: RecipientData,
  bankNameForPersist: string,
  derivedSwiftBic: string | undefined,
  countryCode: string,
) {
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
    metadata: recipientData.metadata ?? {},
  }
}
