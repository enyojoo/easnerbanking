/** Normalize Noah / catalog / Yellow Card mobile provider labels to icon asset keys. */
export function normalizeMobileMoneyProviderKey(label: string): string | undefined {
  const p = String(label || "")
    .trim()
    .toLowerCase()
  if (!p) return undefined
  if (p === "at" || p.includes("airteltigo")) return "airteltigo"
  if (p.includes("airtel")) return "airtel"
  if (p.includes("azampesa")) return undefined
  if (p.includes("halopesa") || p.includes("halo pesa")) return "halopesa"
  if (p.includes("m-pesa") || p.includes("mpesa") || p.includes("m pesa")) return "mpesa"
  if (p.includes("mtn")) return "mtn"
  if (p.includes("telecel") || p.includes("vodafone")) return "vodafone"
  if (p.includes("moov")) return "moov"
  if (p.includes("orange")) return "orange"
  if (p.includes("togocell") || p.includes("togocel") || p.includes("togo cell")) return "togocell"
  if (p.includes("tigo")) return "airtel"
  if (p.includes("wave")) return "wave"
  if (p === "tnm" || p.includes("tnm ") || p.endsWith(" tnm") || p.includes("mpamba")) return "tnm"
  if (p === "free" || p.includes("free money")) return "free"
  return undefined
}

const MOBILE_MONEY_ICON_KEYS = new Set([
  "mtn",
  "mpesa",
  "airtel",
  "airteltigo",
  "vodafone",
  "orange",
  "moov",
  "wave",
  "tnm",
  "halopesa",
  "togocell",
  "free",
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
