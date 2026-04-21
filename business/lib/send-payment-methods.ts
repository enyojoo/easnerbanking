export const otherCurrencies = [
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
] as const

export type OtherCurrencyCode = (typeof otherCurrencies)[number]["code"]

export const currencyPaymentMethods: Record<
  OtherCurrencyCode,
  Array<{ code: string; name: string }>
> = {
  GHS: [
    { code: "bankTransfer", name: "Bank Transfer" },
    { code: "mtnMomo", name: "MTN MOMO" },
  ],
  KES: [
    { code: "mpesa", name: "M-Pesa" },
    { code: "bankTransfer", name: "Bank Transfer" },
  ],
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
