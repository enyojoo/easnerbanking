import { useCallback, useMemo } from 'react'
import {
  coerceEurTransferTypeForProvider,
  coerceUsTransferTypeForProvider,
  eurBankPaymentMethodsForProvider,
  recipientFormRequiresSwiftBic,
  recipientFormShowsAddress,
  resolvePrimaryPayoutProvider,
  usBankPaymentMethodsForProvider,
  type EurBankTransferType,
  type UsBankTransferType,
} from '@easner/shared'
import { getPayoutFieldsSchemaForCorridor } from '../lib/recipientCatalog'
import type { CountryCurrency } from '../lib/countryCurrencyMapping'

type BankCorridor = {
  country_code: string
  currency_code: string
  provider_routing?: unknown
  fields_schema?: unknown
}

export type BankFormTransferType = UsBankTransferType | EurBankTransferType

export function useBankRecipientFormRails(input: {
  selectedRecipientType: string | null
  selectedCountryCurrency: CountryCurrency | null
  bankCorridors: BankCorridor[]
}) {
  const { selectedRecipientType, selectedCountryCurrency, bankCorridors } = input

  const selectedBankCorridor = useMemo(() => {
    if (!selectedCountryCurrency || selectedRecipientType !== 'bank') return null
    return (
      bankCorridors.find(
        (c) =>
          c.country_code === selectedCountryCurrency.countryCode &&
          c.currency_code === selectedCountryCurrency.currencyCode,
      ) ?? null
    )
  }, [bankCorridors, selectedCountryCurrency, selectedRecipientType])

  const payoutProvider = resolvePrimaryPayoutProvider(selectedBankCorridor?.provider_routing)

  const schemaHints = useMemo(() => {
    if (!selectedCountryCurrency || selectedRecipientType !== 'bank') return null
    return getPayoutFieldsSchemaForCorridor({
      countryCode: selectedCountryCurrency.countryCode,
      currencyCode: selectedCountryCurrency.currencyCode,
      rail: 'bank_transfer',
    })
  }, [selectedCountryCurrency, selectedRecipientType])

  const usTransferMethods = useMemo(() => {
    if (selectedRecipientType !== 'bank') return []
    if (selectedCountryCurrency?.currencyCode !== 'USD') return []
    return usBankPaymentMethodsForProvider(payoutProvider)
  }, [selectedRecipientType, selectedCountryCurrency, payoutProvider])

  const eurTransferMethods = useMemo(() => {
    if (selectedRecipientType !== 'bank') return []
    if (selectedCountryCurrency?.currencyCode !== 'EUR') return []
    return eurBankPaymentMethodsForProvider(payoutProvider)
  }, [selectedRecipientType, selectedCountryCurrency, payoutProvider])

  const showsHolderAddress =
    selectedRecipientType === 'bank' &&
    Boolean(selectedCountryCurrency) &&
    recipientFormShowsAddress({
      hints: schemaHints,
      currencyCode: selectedCountryCurrency?.currencyCode ?? '',
      countryCode: selectedCountryCurrency?.countryCode,
      payoutProvider,
    })

  const requiresSwiftBic =
    selectedRecipientType === 'bank' &&
    Boolean(selectedCountryCurrency) &&
    recipientFormRequiresSwiftBic({
      currencyCode: selectedCountryCurrency?.currencyCode ?? '',
      hints: schemaHints,
    })

  const coerceTransferType = useCallback(
    (current: string | null | undefined): BankFormTransferType | null => {
      if (usTransferMethods.length > 0) {
        return coerceUsTransferTypeForProvider(current, payoutProvider)
      }
      if (eurTransferMethods.length > 0) {
        return coerceEurTransferTypeForProvider(current, payoutProvider)
      }
      return null
    },
    [usTransferMethods, eurTransferMethods, payoutProvider],
  )

  return {
    selectedBankCorridor,
    payoutProvider,
    schemaHints,
    usTransferMethods,
    eurTransferMethods,
    showsHolderAddress,
    requiresSwiftBic,
    coerceTransferType,
  }
}
