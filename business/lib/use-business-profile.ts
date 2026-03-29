"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { countries } from "@/lib/countries"
import { businessProfileStore } from "@/lib/business-profile-store"

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
  const token = data.session?.access_token
  if (!token) return null

  const res = await fetch("/api/business/profile", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { profile?: BusinessProfile }
  if (json.profile) {
    // invalidate store cache so pages don't flicker but do revalidate
    // (store will keep last renderable data until fresh arrives)
    const { data: session } = await supabase.auth.getUser()
    if (session?.user?.id) businessProfileStore.invalidate(session.user.id)
    window.dispatchEvent(new Event("business-profile-updated"))
  }
  return json.profile ?? null
}

function profileFromStore(): BusinessProfile {
  const d = businessProfileStore.getData()
  if (!d) return DEFAULT_PROFILE
  return {
    ...d.profile,
    countryCode: d.profile.countryCode ?? countryCodeFromName(d.profile.country),
  }
}

export function useBusinessProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE)
  const [isLoading, setIsLoading] = useState(false)
  const mountedRef = useRef(true)

  // Hydrate from localStorage before paint so header/nav avoid skeleton + skip redundant fetch when fresh.
  useLayoutEffect(() => {
    if (!user?.id) {
      setProfile(DEFAULT_PROFILE)
      setIsLoading(false)
      return
    }
    businessProfileStore.hydrateSync(user.id)
    const d = businessProfileStore.getData()
    if (d) {
      setProfile(profileFromStore())
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }
  }, [user?.id])

  useEffect(() => {
    mountedRef.current = true

    if (!user?.id) {
      return
    }

    const initialize = async () => {
      try {
        await businessProfileStore.initialize(user.id)
      } finally {
        if (mountedRef.current) setIsLoading(false)
      }
    }

    const unsubscribe = businessProfileStore.subscribe(() => {
      if (!mountedRef.current) return
      const d = businessProfileStore.getData()
      if (!d) return
      setProfile({
        ...d.profile,
        countryCode: d.profile.countryCode ?? countryCodeFromName(d.profile.country),
      })
    })

    const onUpdate = () => {
      if (user.id) businessProfileStore.invalidate(user.id)
      void initialize()
    }

    void initialize()
    window.addEventListener("business-profile-updated", onUpdate)
    return () => {
      mountedRef.current = false
      unsubscribe()
      window.removeEventListener("business-profile-updated", onUpdate)
    }
  }, [user?.id])

  return {
    ...profile,
    isLoading,
  }
}
