import {
  eurBankPaymentMethodsForProvider,
  usBankPaymentMethodsForProvider,
  type PayoutProviderId,
} from '@easner/shared'
import type { RecipientFormType } from './recipientFormTypes'
import type { CountryCurrency } from '../countryCurrencyMapping'

export type BankTransferMethodOption = {
  value: string
  label: string
  speedLabel: string
}

export function usTransferMethodsForForm(args: {
  selectedRecipientType: RecipientFormType | null
  countryCurrency: CountryCurrency | null
  payoutProvider: PayoutProviderId
  hasSelectedBankCorridor: boolean
}): BankTransferMethodOption[] {
  if (args.selectedRecipientType !== 'bank' || args.countryCurrency?.countryCode !== 'US') {
    return []
  }
  if (!args.hasSelectedBankCorridor) {
    return usBankPaymentMethodsForProvider('noah').slice(0, 1)
  }
  return usBankPaymentMethodsForProvider(args.payoutProvider)
}

export function eurTransferMethodsForForm(args: {
  selectedRecipientType: RecipientFormType | null
  currency: string
  payoutProvider: PayoutProviderId
  hasSelectedBankCorridor: boolean
}): BankTransferMethodOption[] {
  if (args.selectedRecipientType !== 'bank' || args.currency !== 'EUR') {
    return []
  }
  if (!args.hasSelectedBankCorridor) {
    return eurBankPaymentMethodsForProvider('noah').slice(0, 1)
  }
  return eurBankPaymentMethodsForProvider(args.payoutProvider)
}

/** Pick first allowed transfer type when current value is missing or invalid. */
export function coerceTransferType(
  current: string | null,
  allowed: BankTransferMethodOption[],
): string | null {
  if (allowed.length === 0) return current
  const values = allowed.map((m) => m.value)
  if (current && values.includes(current)) return current
  return allowed[0]?.value ?? null
}
