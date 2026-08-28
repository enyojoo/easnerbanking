import {
  recipientFormNeedsEmail,
  recipientFormNeedsPhone,
} from '@easner/shared'
import type { RecipientData } from '../recipientService'
import { getPayoutFieldsSchemaForCorridor } from '../recipientCatalog'
import { buildRecipientYcMetadata } from './buildRecipientYcMetadata'
import { recipientFormShowsHolderAddress } from './isRecipientFormValid'
import {
  formatMobileBankLabel,
  formatWalletBankLabel,
  type EasenetProfilePreview,
  type RecipientFormType,
  type RecipientFormValues,
} from './recipientFormTypes'
import type { RecipientFormValidationContext } from './isRecipientFormValid'

export function buildEasenetPersistPayload(profile: EasenetProfilePreview): RecipientData {
  const tag = profile.easetag
  return {
    fullName: profile.fullName,
    accountNumber: tag,
    bankName: `Easetag (@${tag})`,
    currency: 'USD',
    countryCode: 'US',
    payeeAvatarUrl: profile.avatarUrl,
    payeeAccountKind: profile.accountKind,
  }
}

export function buildRecipientPersistPayload(args: {
  values: RecipientFormValues
  selectedRecipientType: RecipientFormType
  selectedCountryCurrency: RecipientFormValidationContext['selectedCountryCurrency']
  transferType: string | null
  validationContext: RecipientFormValidationContext
}): RecipientData {
  const { values, selectedRecipientType, selectedCountryCurrency, transferType, validationContext } =
    args
  const showsHolderAddress = recipientFormShowsHolderAddress(validationContext)
  const bankSchemaHints =
    selectedCountryCurrency && selectedRecipientType === 'bank'
      ? getPayoutFieldsSchemaForCorridor({
          countryCode: selectedCountryCurrency.countryCode,
          currencyCode: selectedCountryCurrency.currencyCode,
          rail: 'bank_transfer',
        })
      : null

  const accountNumberForType =
    selectedRecipientType === 'wallet'
      ? values.walletAddress
      : selectedRecipientType === 'mobile'
        ? values.phoneNumber
        : values.accountNumber
  const bankNameForType =
    selectedRecipientType === 'wallet'
      ? formatWalletBankLabel(values.currency, values.network)
      : selectedRecipientType === 'mobile'
        ? formatMobileBankLabel(values.provider)
        : values.bankName

  return {
    fullName: values.fullName,
    accountNumber: accountNumberForType,
    bankName: bankNameForType,
    currency: values.currency,
    countryCode: selectedCountryCurrency?.countryCode,
    phoneNumber:
      selectedRecipientType === 'mobile' ||
      (selectedRecipientType === 'bank' && recipientFormNeedsPhone(bankSchemaHints))
        ? values.phoneNumber.trim() || undefined
        : undefined,
    email:
      selectedRecipientType === 'bank' && recipientFormNeedsEmail(bankSchemaHints)
        ? values.email.trim() || undefined
        : undefined,
    mobileProvider: selectedRecipientType === 'mobile' ? values.provider : undefined,
    walletNetwork: selectedRecipientType === 'wallet' ? values.network : undefined,
    routingNumber: values.routingNumber || undefined,
    sortCode: values.sortCode || undefined,
    iban: values.iban || undefined,
    swiftBic: values.swiftBic || undefined,
    transferType:
      selectedCountryCurrency?.countryCode === 'US' || values.currency === 'EUR'
        ? transferType || undefined
        : undefined,
    checkingOrSavings:
      selectedCountryCurrency?.countryCode === 'US' &&
      (values.checkingOrSavings === 'checking' || values.checkingOrSavings === 'savings')
        ? values.checkingOrSavings
        : undefined,
    addressLine1: showsHolderAddress ? values.addressLine1 || undefined : undefined,
    city: showsHolderAddress ? values.city || undefined : undefined,
    state: showsHolderAddress ? values.state || undefined : undefined,
    postalCode: showsHolderAddress ? values.postalCode || undefined : undefined,
    metadata:
      selectedRecipientType === 'bank'
        ? buildRecipientYcMetadata(values, selectedCountryCurrency?.countryCode)
        : undefined,
  }
}
