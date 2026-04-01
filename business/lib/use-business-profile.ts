"use client"

import { useCallback, useEffect, useMemo } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { countries } from "@/lib/countries"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"

export type BusinessProfile = {
  organizationId: string | null
  name: string
  logoUrl: string | null
  businessType: string
  registrationNumber: string
  taxId: string
  baseCurrency: string
  description: string
  website: string
  supportEmail: string
  supportPhone: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
  country: string | null
  countryCode: string | null
  onboardingComplete: boolean
  role: "business" | "individual"
  ownerName: string
  /** Org-level Tier 1: Owner's business KYB approved (`noah_kyb_status === 'approved'`). */
  tier1Complete: boolean
  /** Owner's `noah_kyb_status` (provider-backed; Easner-facing label via UI copy). */
  tier1VerificationStatus: string | null
  /** Internal reference on Owner's user row; not shown to customers in UI. */
  noahKybCustomerId: string | null
  /** Whether the signed-in user may start or refresh hosted business verification. */
  canManageBusinessVerification: boolean
}

const DEFAULT_PROFILE: BusinessProfile = {
  organizationId: null,
  name: "",
  logoUrl: null,
  businessType: "",
  registrationNumber: "",
  taxId: "",
  baseCurrency: "USD",
  description: "",
  website: "",
  supportEmail: "",
  supportPhone: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: null,
  countryCode: null,
  onboardingComplete: false,
  role: "business",
  ownerName: "",
  tier1Complete: false,
  tier1VerificationStatus: null,
  noahKybCustomerId: null,
  canManageBusinessVerification: true,
}

function countryCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const found = countries.find((c) => c.name.toLowerCase() === name.toLowerCase())
  return found?.code ?? null
}

export async function updateBusinessProfile(payload: {
  businessName?: string
  businessLogo?: string | null
  businessType?: string
  registrationNumber?: string
  taxId?: string
  baseCurrency?: string
  businessDescription?: string
  website?: string
  supportEmail?: string
  supportPhone?: string
  addressLine1?: string
  city?: string
  state?: string
  postalCode?: string
  countryCode?: string
}) {
  const supabase = createSupabaseBrowser()
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null

  const res = await fetchWithSession("/api/business/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { profile?: BusinessProfile }
  if (json.profile) {
    // Invalidate shared cache key so active pages can revalidate consistently.
    const { data: session } = await supabase.auth.getUser()
    if (session?.user?.id) dataCache.invalidate(CACHE_KEYS.BUSINESS_PROFILE(session.user.id))
    window.dispatchEvent(new Event("business-profile-updated"))
  }
  return json.profile ?? null
}

export function useBusinessProfile() {
  const { user } = useAuth()
  const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000
  const cacheKey = user?.id ? CACHE_KEYS.BUSINESS_PROFILE(user.id) : null
  const { data: profileData, setData, loading: isLoading } = useCachedData<BusinessProfile>({
    enabled: Boolean(user?.id),
    cacheKey,
    persistKey: user?.id ? `business_profile_cache_${user.id}` : undefined,
    initialData: DEFAULT_PROFILE,
    ttlMs: PROFILE_CACHE_TTL_MS,
    persistMaxAgeMs: PROFILE_CACHE_TTL_MS,
    fetcher: async () => {
      const res = await fetchWithSession("/api/business/profile")
      if (!res.ok) throw new Error("Failed to load profile")
      const json = (await res.json()) as { profile?: BusinessProfile }
      if (!json.profile) throw new Error("Missing profile")
      return json.profile
    },
  })

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return
    const res = await fetchWithSession("/api/business/profile")
    if (!res.ok) return
    const json = (await res.json()) as { profile?: BusinessProfile }
    if (!json.profile) return
    setData(json.profile)
  }, [setData, user?.id])

  useEffect(() => {
    const onUpdate = () => {
      if (!user?.id) return
      dataCache.invalidate(CACHE_KEYS.BUSINESS_PROFILE(user.id))
      void refreshProfile()
    }
    window.addEventListener("business-profile-updated", onUpdate)
    return () => window.removeEventListener("business-profile-updated", onUpdate)
  }, [refreshProfile, user?.id])

  const profile = useMemo(
    () => ({
      ...profileData,
      countryCode: profileData.countryCode ?? countryCodeFromName(profileData.country),
    }),
    [profileData],
  )
  const hasCachedProfile = Boolean(cacheKey && dataCache.get(cacheKey) != null)
  const isFresh = Boolean(cacheKey && hasCachedProfile && !dataCache.isStale(cacheKey))
  const hasData = hasCachedProfile

  return {
    ...profile,
    isLoading,
    isFresh,
    hasData,
  }
}
