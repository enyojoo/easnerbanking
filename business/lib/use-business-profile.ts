"use client"

import { useEffect, useMemo, useState } from "react"
import { createSupabaseBrowser } from "@/lib/supabase/browser"
import { useAuth } from "@/lib/auth-context"
import { countries } from "@/lib/countries"
import { businessInfo } from "@/lib/business-info"

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
}

const DEFAULT_PROFILE: BusinessProfile = {
  organizationId: null,
  name: businessInfo.name,
  logoUrl: null,
  businessType: "Financial Services",
  registrationNumber: "",
  taxId: "",
  baseCurrency: "USD",
  description: "A modern digital banking platform providing seamless financial services.",
  website: "",
  supportEmail: "",
  supportPhone: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: businessInfo.country,
  countryCode: "US",
  onboardingComplete: true,
  role: "business",
  ownerName: "Admin",
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
  if (json.profile) window.dispatchEvent(new Event("business-profile-updated"))
  return json.profile ?? null
}

export function useBusinessProfile() {
  const { user } = useAuth()
  const supabase = useMemo(() => createSupabaseBrowser(), [])
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) {
      setProfile(DEFAULT_PROFILE)
      setIsLoading(false)
      return
    }

    let active = true
    const loadProfile = async () => {
      setIsLoading(true)
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return
        const res = await fetch("/api/business/profile", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const json = (await res.json()) as { profile?: BusinessProfile }
        if (active && json.profile) {
          setProfile({
            ...json.profile,
            countryCode: json.profile.countryCode ?? countryCodeFromName(json.profile.country),
          })
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    const onUpdate = () => {
      void loadProfile()
    }

    void loadProfile()
    window.addEventListener("business-profile-updated", onUpdate)
    return () => {
      active = false
      window.removeEventListener("business-profile-updated", onUpdate)
    }
  }, [supabase, user?.id])

  return {
    ...profile,
    isLoading,
  }
}
