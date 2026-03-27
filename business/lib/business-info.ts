import { getOnboarding } from "@/lib/onboarding-store"

/**
 * Business info for invoices and customer-facing pages.
 * In production, this would come from settings/API.
 */
export const businessInfo = {
  name: "Amazon, Inc",
  address: "410 Terry Avenue North",
  city: "Seattle",
  state: "WA",
  zipCode: "98109",
  country: "United States",
  email: "business@amazon.com",
  phone: "+1 (206) 266-1000",
  website: "https://amazon.com",
} as const

/** Display name and logo from onboarding when set (client only). */
export function getResolvedBusinessProfile(): { name: string; logoUrl: string | null } {
  const defaults = { name: businessInfo.name, logoUrl: null as string | null }
  if (typeof window === "undefined") return defaults
  const o = getOnboarding()
  if (!o) return defaults
  return {
    name: o.businessName?.trim() ? o.businessName.trim() : defaults.name,
    logoUrl: o.businessLogo ?? null,
  }
}
