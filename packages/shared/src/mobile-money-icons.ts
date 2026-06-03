/** Normalize Noah / catalog mobile provider labels to icon asset keys. */
export function normalizeMobileMoneyProviderKey(label: string): string | undefined {
  const p = String(label || "")
    .trim()
    .toLowerCase()
  if (!p) return undefined
  if (p.includes("airteltigo")) return "airteltigo"
  if (p.includes("airtel")) return "airtel"
  if (p.includes("m-pesa") || p.includes("mpesa")) return "mpesa"
  if (p.includes("mtn")) return "mtn"
  if (p.includes("vodafone")) return "vodafone"
  if (p.includes("orange")) return "orange"
  if (p.includes("moov")) return "orange"
  if (p.includes("tigo")) return "airtel"
  if (p.includes("wave")) return "orange"
  return undefined
}

const MOBILE_MONEY_ICON_KEYS = new Set([
  "mtn",
  "mpesa",
  "airtel",
  "airteltigo",
  "vodafone",
  "orange",
])

export function hasMobileMoneyProviderIcon(label: string): boolean {
  const key = normalizeMobileMoneyProviderKey(label)
  return Boolean(key && MOBILE_MONEY_ICON_KEYS.has(key))
}

/** Web / public static path (files in business/public/mobile-money). */
export function getMobileMoneyProviderPublicUrl(label: string): string | undefined {
  const key = normalizeMobileMoneyProviderKey(label)
  if (!key || !MOBILE_MONEY_ICON_KEYS.has(key)) return undefined
  return `/mobile-money/${key}.png`
}
