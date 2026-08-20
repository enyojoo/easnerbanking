"use client"

import { useCallback, useEffect, useMemo } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { countries } from "@/lib/countries"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import { normalizeBusinessLogoUrl } from "@/lib/image-cache"
import type { InvoiceReplyEmailSource } from "@/lib/invoices/invoice-reply-email"
import type { InvoicePaymentDefaults } from "@/lib/b2b/types"
import { isChannelHealthy, pollingIntervalFor } from "@easner/shared"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"

export type BusinessProfile = {
  businessId: string | null
  name: string
  easetag: string | null
  logoUrl: string | null
  businessType: string
  registrationNumber: string
  taxId: string
  baseCurrency: string
  /** True when org KYB approved and verified entity fields are locked. */
  profileLocked?: boolean
  description: string
  website: string
  supportEmail: string
  supportPhone: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
  registeredAddressLine1: string
  registeredAddressCity: string
  registeredAddressState: string
  registeredAddressPostalCode: string
  /** Operational address country (invoices/statements). */
  country: string | null
  countryCode: string | null
  /** KYB registration country (legal entity; read-only in Settings). */
  registrationCountry: string | null
  registrationCountryCode: string | null
  onboardingComplete: boolean
  role: "business" | "individual"
  ownerName: string
  /** Org-level Tier 1: Business KYB approved (`verification_status === 'approved'`). */
  tier1Complete: boolean
  /** Org verification status from profile API (Grid canonical `verification_status`). */
  tier1VerificationStatus: string | null
  /** Decline reasons from Noah when org KYB is rejected. */
  tier1RejectionReasons: unknown[] | null
  tier1RejectionType: string | null
  tier1CanResubmit: boolean
  tier1RetryGuidance: string[]
  /** Internal reference on Owner's user row; not shown to customers in UI. */
  noahKybCustomerId: string | null
  /** Whether the signed-in user may start or refresh hosted business verification. */
  canManageBusinessVerification: boolean
  /** Resolved Reply-To for invoice emails (support → owner → sender). */
  invoiceReplyEmail: string | null
  invoiceReplyEmailSource: InvoiceReplyEmailSource | null
  /** From `businesses.invoice_settings`. */
  invoiceSettings?: InvoicePaymentDefaults
  /** Master switch for card/bank collections (`business_checkout_settings`). */
  onlinePaymentsEnabled?: boolean
}

const DEFAULT_PROFILE: BusinessProfile = {
  businessId: null,
  name: "",
  easetag: null,
  logoUrl: null,
  businessType: "",
  registrationNumber: "",
  taxId: "",
  baseCurrency: "USD",
  profileLocked: false,
  description: "",
  website: "",
  supportEmail: "",
  supportPhone: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  registeredAddressLine1: "",
  registeredAddressCity: "",
  registeredAddressState: "",
  registeredAddressPostalCode: "",
  country: null,
  countryCode: null,
  registrationCountry: null,
  registrationCountryCode: null,
  onboardingComplete: false,
  role: "business",
  ownerName: "",
  tier1Complete: false,
  tier1VerificationStatus: null,
  tier1RejectionReasons: null,
  tier1RejectionType: null,
  tier1CanResubmit: true,
  tier1RetryGuidance: [],
  noahKybCustomerId: null,
  canManageBusinessVerification: true,
  invoiceReplyEmail: null,
  invoiceReplyEmailSource: null,
  invoiceSettings: undefined,
  onlinePaymentsEnabled: true,
}

function countryCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const found = countries.find((c) => c.name.toLowerCase() === name.toLowerCase())
  return found?.code ?? null
}

function verificationStatusNeedsLiveUpdates(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase().trim()
  return s !== "approved"
}

function verificationLiveRefetchIntervalMs(
  status: string | null | undefined,
  visible: boolean,
  health: ReturnType<typeof useRealtimeHealth>,
): number | false {
  if (!visible || !verificationStatusNeedsLiveUpdates(status)) return false
  const s = String(status ?? "").toLowerCase()
  if (!isChannelHealthy(health)) {
    if (s === "in_progress" || s === "hold" || s === "rejected") return 15_000
    if (s === "pending" || s.includes("review")) return 30_000
    return pollingIntervalFor("operational", health)
  }
  if (s === "in_progress" || s === "hold" || s === "rejected") return 20_000
  if (s === "pending" || s.includes("review")) return 60_000
  return false
}

export async function updateBusinessProfile(payload: {
  businessName?: string
  easetag?: string | null
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
    const { data: session } = await supabase.auth.getUser()
    if (session?.user?.id) {
      // Apply immediately so Settings (and any open UI) does not race `refreshProfile()` and
      // briefly re-hydrate form state from stale profile in memory.
      window.dispatchEvent(
        new CustomEvent<BusinessProfile>("business-profile-updated", { detail: json.profile }),
      )
    }
  }
  return json.profile ?? null
}

/** Merge fields into the cached profile so Settings updates without a refetch. */
export function patchCachedBusinessProfile(patch: Partial<BusinessProfile>) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<Partial<BusinessProfile>>("business-profile-patch", { detail: patch }))
}

export function applyHostedKycStatusToProfile(kycStatus: string | undefined) {
  if (kycStatus !== "not_started") return
  patchCachedBusinessProfile({
    tier1VerificationStatus: "not_started",
    noahKybCustomerId: null,
    tier1Complete: false,
    tier1CanResubmit: true,
  })
}

export function useBusinessProfile() {
  const { user, sessionUserId } = useAuth()
  const profileUserId = sessionUserId
  const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000
  const PROFILE_PERSIST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
  const cacheKey = profileUserId ? CACHE_KEYS.BUSINESS_PROFILE(profileUserId) : null
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const { data: profileData, setData, loading: isLoading } = useCachedData<BusinessProfile>({
    enabled: Boolean(sessionUserId ?? user?.id),
    cacheKey,
    persistKey: profileUserId ? `business_profile_cache_${profileUserId}` : undefined,
    initialData: DEFAULT_PROFILE,
    ttlMs: PROFILE_CACHE_TTL_MS,
    persistMaxAgeMs: PROFILE_PERSIST_MAX_AGE_MS,
    refetchInterval: (query) =>
      verificationLiveRefetchIntervalMs(
        query.state.data?.tier1VerificationStatus,
        tabVisible,
        realtimeHealth,
      ),
    refetchOnWindowFocus: (query) =>
      verificationStatusNeedsLiveUpdates(query.state.data?.tier1VerificationStatus),
    refetchOnMount: (query) =>
      verificationStatusNeedsLiveUpdates(query.state.data?.tier1VerificationStatus)
        ? "always"
        : true,
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
    const persistProfile = (next: BusinessProfile) => {
      setData(next)
      if (!user?.id) return
      dataCache.set(CACHE_KEYS.BUSINESS_PROFILE(user.id), next, PROFILE_CACHE_TTL_MS)
      if (typeof window === "undefined") return
      try {
        localStorage.setItem(
          `business_profile_cache_${user.id}`,
          JSON.stringify({ data: next, timestamp: Date.now() }),
        )
      } catch {
        // ignore
      }
    }

    const onUpdate = (e: Event) => {
      if (!user?.id) return
      const detail = (e as CustomEvent<BusinessProfile | undefined>).detail
      if (detail) {
        persistProfile(detail)
        return
      }
      dataCache.invalidate(CACHE_KEYS.BUSINESS_PROFILE(user.id))
      void refreshProfile()
    }
    const onPatch = (e: Event) => {
      const patch = (e as CustomEvent<Partial<BusinessProfile> | undefined>).detail
      if (!patch) return
      setData((prev) => {
        const next = { ...prev, ...patch }
        if (user?.id) {
          dataCache.set(CACHE_KEYS.BUSINESS_PROFILE(user.id), next, PROFILE_CACHE_TTL_MS)
          try {
            localStorage.setItem(
              `business_profile_cache_${user.id}`,
              JSON.stringify({ data: next, timestamp: Date.now() }),
            )
          } catch {
            // ignore
          }
        }
        return next
      })
    }
    window.addEventListener("business-profile-updated", onUpdate)
    window.addEventListener("business-profile-patch", onPatch)
    return () => {
      window.removeEventListener("business-profile-updated", onUpdate)
      window.removeEventListener("business-profile-patch", onPatch)
    }
  }, [refreshProfile, setData, user?.id])

  const profile = useMemo(
    () => ({
      ...profileData,
      logoUrl: normalizeBusinessLogoUrl(profileData.logoUrl),
      countryCode: profileData.countryCode ?? countryCodeFromName(profileData.country),
      registrationCountryCode:
        profileData.registrationCountryCode ??
        countryCodeFromName(profileData.registrationCountry ?? profileData.country),
    }),
    [profileData],
  )
  const hasCachedProfile = Boolean(cacheKey && dataCache.get(cacheKey) != null)
  const isFresh = Boolean(cacheKey && hasCachedProfile && !dataCache.isStale(cacheKey))
  /** True when memory cache has profile OR we already finished a load (survives `dataCache.invalidate` during `business-profile-updated` without detail). */
  const hasLoadedProfile = Boolean(
    profileUserId &&
      (profileData.businessId != null || profileData.name.trim().length > 0),
  )
  const hasData = hasCachedProfile || hasLoadedProfile

  return {
    ...profile,
    isLoading,
    isFresh,
    hasData,
  }
}
