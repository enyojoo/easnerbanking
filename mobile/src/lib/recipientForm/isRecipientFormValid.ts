import {
  isBankNameAllowedForCorridor,
  isMomoProviderAllowedForCorridor,
  recipientFormNeedsBankCode,
  recipientFormNeedsEmail,
  recipientFormNeedsPhone,
  recipientFormShowsAddress,
  validateGridRecipientForCorridor,
  validateYcRecipientForCorridor,
  type PayoutProviderId,
} from '@easner/shared'
import { validateRecipientHolderAddress } from '@easner/shared/postal-address-form'
import { getAccountTypeConfigFromCurrency } from '../currencyAccountTypes'
import type { CountryCurrency } from '../countryCurrencyMapping'
import { getPayoutFieldsSchemaForCorridor, type getCorridorRecipientOptions } from '../recipientCatalog'
import { buildRecipientYcMetadata } from './buildRecipientYcMetadata'
import { mapRecipientFormFieldName } from './mapRecipientFormFieldName'
import type { EasenetProfilePreview, RecipientFormType, RecipientFormValues } from './recipientFormTypes'
import type { BankTransferMethodOption } from './recipientTransferMethods'

export type RecipientFormValidationContext = {
  values: RecipientFormValues
  selectedRecipientType: RecipientFormType | null
  selectedCountryCurrency: CountryCurrency | null
  transferType: string | null
  usTransferMethods: BankTransferMethodOption[]
  eurTransferMethods: BankTransferMethodOption[]
  corridorRecipientOptions: ReturnType<typeof getCorridorRecipientOptions>
  easenetProfile: EasenetProfilePreview | null
  payoutProvider: PayoutProviderId
  ycCorridorSchema: ReturnType<typeof import('@easner/shared').resolveYcCorridorSchema> | null
  selectedBankCorridorFieldsSchema: unknown
}

export function recipientFormShowsHolderAddress(ctx: RecipientFormValidationContext): boolean {
  if (ctx.selectedRecipientType !== 'bank') return false
  const bankSchemaHints =
    ctx.selectedCountryCurrency && ctx.selectedRecipientType === 'bank'
      ? getPayoutFieldsSchemaForCorridor({
          countryCode: ctx.selectedCountryCurrency.countryCode,
          currencyCode: ctx.selectedCountryCurrency.currencyCode,
          rail: 'bank_transfer',
        })
      : null
  return recipientFormShowsAddress({
    hints: bankSchemaHints,
    currencyCode: ctx.values.currency,
    countryCode: ctx.selectedCountryCurrency?.countryCode,
    payoutProvider: ctx.payoutProvider,
  })
}

export function isRecipientFormValid(ctx: RecipientFormValidationContext): boolean {
  const { values, selectedRecipientType } = ctx
  const showsHolderAddress = recipientFormShowsHolderAddress(ctx)

  if (selectedRecipientType === 'easenet') {
    return Boolean(ctx.easenetProfile && values.payeeEasetag.trim().length >= 1)
  }
  if (!values.fullName || !values.currency) return false

  if (selectedRecipientType === 'wallet') {
    return !!values.network && !!values.walletAddress
  }
  if (selectedRecipientType === 'mobile') {
    return !!values.provider && !!values.phoneNumber
  }

  if (
    ctx.selectedCountryCurrency?.countryCode === 'US' &&
    ctx.usTransferMethods.length > 0 &&
    !ctx.transferType
  ) {
    return false
  }
  if (values.currency === 'EUR' && ctx.eurTransferMethods.length > 0 && !ctx.transferType) {
    return false
  }
  if (showsHolderAddress && ctx.selectedCountryCurrency) {
    const addressResult = validateRecipientHolderAddress(ctx.selectedCountryCurrency.countryCode, {
      line1: values.addressLine1,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      countryCode: ctx.selectedCountryCurrency.countryCode,
    })
    if (!addressResult.valid) return false
  }

  const accountConfig = getAccountTypeConfigFromCurrency(values.currency)
  for (const field of accountConfig.requiredFields) {
    const formFieldName = mapRecipientFormFieldName(field)
    const fieldValue = values[formFieldName as keyof RecipientFormValues]
    if (!fieldValue || (typeof fieldValue === 'string' && !fieldValue.trim())) {
      return false
    }
  }

  const bankEnum = ctx.corridorRecipientOptions.bankOptions
  if (
    bankEnum.length > 0 &&
    values.bankName.trim() &&
    !isBankNameAllowedForCorridor(values.bankName.trim(), ctx.corridorRecipientOptions)
  ) {
    return false
  }

  if (
    selectedRecipientType === 'mobile' &&
    ctx.corridorRecipientOptions.momoOptions.length > 0 &&
    values.provider.trim() &&
    !isMomoProviderAllowedForCorridor(values.provider.trim(), ctx.corridorRecipientOptions)
  ) {
    return false
  }

  const schemaHints =
    ctx.selectedCountryCurrency && selectedRecipientType === 'bank'
      ? getPayoutFieldsSchemaForCorridor({
          countryCode: ctx.selectedCountryCurrency.countryCode,
          currencyCode: ctx.selectedCountryCurrency.currencyCode,
          rail: 'bank_transfer',
        })
      : null
  if (recipientFormNeedsEmail(schemaHints) && !values.email.trim()) return false
  if (recipientFormNeedsPhone(schemaHints) && !values.phoneNumber.trim()) return false
  if (values.currency !== 'EUR' && recipientFormNeedsBankCode(schemaHints)) {
    const swift = values.swiftBic.trim()
    if (!swift || !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(swift)) return false
  }

  const ycMetadata = buildRecipientYcMetadata(values, ctx.selectedCountryCurrency?.countryCode)
  const corridorRow = bankCorridorValidationRow(ctx, ycMetadata)

  if (
    selectedRecipientType === 'bank' &&
    ctx.selectedCountryCurrency &&
    ctx.payoutProvider === 'yellowcard' &&
    ctx.ycCorridorSchema?.status === 'ready'
  ) {
    const ycCheck = validateYcRecipientForCorridor({
      countryCode: ctx.selectedCountryCurrency.countryCode,
      currencyCode: ctx.selectedCountryCurrency.currencyCode,
      fieldsSchema: ctx.selectedBankCorridorFieldsSchema,
      row: corridorRow,
    })
    if (!ycCheck.ok) return false
  }

  if (
    selectedRecipientType === 'bank' &&
    ctx.selectedCountryCurrency &&
    (ctx.payoutProvider === 'grid' || ctx.corridorRecipientOptions.extraFields.length > 0)
  ) {
    const gridCheck = validateGridRecipientForCorridor({
      countryCode: ctx.selectedCountryCurrency.countryCode,
      currencyCode: ctx.selectedCountryCurrency.currencyCode,
      fieldsSchema: ctx.selectedBankCorridorFieldsSchema,
      row: corridorRow,
    })
    if (!gridCheck.ok) return false
  }

  return true
}

/** Include routing / IBAN so Grid US and EUR match the visible form fields. */
function bankCorridorValidationRow(
  ctx: RecipientFormValidationContext,
  metadata: ReturnType<typeof buildRecipientYcMetadata>,
) {
  const { values, selectedCountryCurrency } = ctx
  const iban = values.iban.replace(/\s/g, '').toUpperCase()
  return {
    country_code: selectedCountryCurrency?.countryCode,
    currency: values.currency,
    full_name: values.fullName,
    account_number: values.accountNumber.trim() || iban,
    iban: values.iban,
    swift_bic: values.swiftBic,
    routing_number: values.routingNumber,
    bank_name: values.bankName,
    phone_number: values.phoneNumber,
    metadata,
  }
}
