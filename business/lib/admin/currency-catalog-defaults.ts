/** Default metadata when bootstrapping `currencies` from `exchange_rates` codes. */
export const CURRENCY_CATALOG_DEFAULTS: Record<
  string,
  { name: string; symbol: string }
> = {
  USD: { name: "US Dollar", symbol: "$" },
  EUR: { name: "Euro", symbol: "€" },
  GBP: { name: "British Pound", symbol: "£" },
  NGN: { name: "Nigerian Naira", symbol: "₦" },
  KES: { name: "Kenyan Shilling", symbol: "KSh" },
  GHS: { name: "Ghanaian Cedi", symbol: "₵" },
  RUB: { name: "Russian Ruble", symbol: "₽" },
  TZS: { name: "Tanzanian Shilling", symbol: "TSh" },
  UGX: { name: "Ugandan Shilling", symbol: "USh" },
  ZAR: { name: "South African Rand", symbol: "R" },
  BWP: { name: "Botswana Pula", symbol: "P" },
  XAF: { name: "Central African CFA franc", symbol: "FCFA" },
  RWF: { name: "Rwandan Franc", symbol: "FRw" },
  USDC: { name: "USD Coin", symbol: "$" },
  USDT: { name: "Tether USD", symbol: "$" },
}

export function defaultCurrencyMeta(code: string): { name: string; symbol: string } {
  const upper = code.trim().toUpperCase()
  return (
    CURRENCY_CATALOG_DEFAULTS[upper] ?? {
      name: upper,
      symbol: upper,
    }
  )
}
