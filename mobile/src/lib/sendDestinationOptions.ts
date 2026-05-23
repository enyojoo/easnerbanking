import type { SendDestinationsResponse } from '@easner/shared'
import {
  buildCrossBorderPaymentMethods,
  buildOtherSendCurrencies,
  type CrossBorderPaymentMethod,
  type OtherSendCurrency,
} from '@easner/shared'
import { getWalletAssets } from './recipientCatalog'

const FALLBACK_OTHER: OtherSendCurrency[] = [
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
]

const FALLBACK_METHODS: Record<string, CrossBorderPaymentMethod[]> = {
  GHS: [
    { code: 'bankTransfer', name: 'Bank Transfer' },
    { code: 'mtnMomo', name: 'MTN MOMO' },
  ],
  KES: [
    { code: 'mpesa', name: 'M-Pesa' },
    { code: 'bankTransfer', name: 'Bank Transfer' },
  ],
}

export function otherCurrenciesFromCatalog(catalog: SendDestinationsResponse | null): OtherSendCurrency[] {
  if (!catalog) return FALLBACK_OTHER
  const built = buildOtherSendCurrencies(catalog)
  return built.length ? built : FALLBACK_OTHER
}

export function paymentMethodsFromCatalog(
  catalog: SendDestinationsResponse | null,
): Record<string, CrossBorderPaymentMethod[]> {
  if (!catalog) return FALLBACK_METHODS
  const built = buildCrossBorderPaymentMethods(catalog)
  return Object.keys(built).length ? built : FALLBACK_METHODS
}

export function stablecoinPickerOptions(catalog: SendDestinationsResponse | null): Array<{ code: string; name: string }> {
  if (catalog?.crypto?.length) {
    const assets = [...new Set(catalog.crypto.map((d) => d.asset_code))]
    return assets.map((code) => ({ code, name: code }))
  }
  return getWalletAssets().map((code) => ({ code, name: code }))
}
