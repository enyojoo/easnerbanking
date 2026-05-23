import type { SendDestinationsResponse } from "@easner/shared"
import {
  buildCrossBorderPaymentMethods,
  buildOtherSendCurrencies,
  type CrossBorderPaymentMethod,
  type OtherSendCurrency,
} from "@easner/shared"

/** @deprecated Prefer buildOtherSendCurrencies(catalog) from send-destinations API */
export const otherCurrencies = [
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
] as const

export type OtherCurrencyCode = string

export const currencyPaymentMethods: Record<string, Array<{ code: string; name: string }>> = {
  GHS: [
    { code: "bankTransfer", name: "Bank Transfer" },
    { code: "mtnMomo", name: "MTN MOMO" },
  ],
  KES: [
    { code: "mpesa", name: "M-Pesa" },
    { code: "bankTransfer", name: "Bank Transfer" },
  ],
}

export function otherCurrenciesFromCatalog(catalog: SendDestinationsResponse | null): OtherSendCurrency[] {
  if (!catalog) return [...otherCurrencies]
  const built = buildOtherSendCurrencies(catalog)
  return built.length ? built : [...otherCurrencies]
}

export function paymentMethodsFromCatalog(
  catalog: SendDestinationsResponse | null,
): Record<string, CrossBorderPaymentMethod[]> {
  if (!catalog) return currencyPaymentMethods
  const built = buildCrossBorderPaymentMethods(catalog)
  return Object.keys(built).length ? built : currencyPaymentMethods
}

export const stablecoinOptions = [
  { code: "usdc", name: "Pay with USDC" },
  { code: "usdt", name: "Pay with USDT" },
] as const

export type StablecoinCode = (typeof stablecoinOptions)[number]["code"]

export type PaymentMethodCode =
  | "balance"
  | "bankTransfer"
  | "mpesa"
  | "mtnMomo"
  | "sbp"
  | "usdc"
  | "usdt"
  | "otherCurrency"
