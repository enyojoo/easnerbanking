/** Reference FX for send-flow estimates until a live quote API is wired. Not executed rates. */
export const currencyRates: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  GBP: 1.27,
  NGN: 0.00065,
  KES: 0.0077,
  GHS: 0.065,
  RUB: 0.011,
}

export const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
  KES: "KSh",
  GHS: "₵",
  RUB: "₽",
}

export const defaultCurrency = "USD"
