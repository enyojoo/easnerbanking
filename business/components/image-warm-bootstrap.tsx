"use client"

import { useEffect } from "react"
import { warmWebBankingImages } from "@easner/shared/image/warm-web-banking-images"
import { useAuth } from "@/lib/auth-context"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { usePersonalProfileAvatar } from "@/lib/use-personal-profile-avatar"
import { warmBusinessLogoUrl, warmProfileImageUrl } from "@/lib/image-cache"

/** Prefetch flags, payout icons, and user/org images once per app session. */
export function ImageWarmBootstrap() {
  const { user } = useAuth()
  const { logoUrl } = useBusinessProfile()
  const { avatarUrl } = usePersonalProfileAvatar()

  useEffect(() => {
    warmWebBankingImages()
  }, [])

  useEffect(() => {
    if (!user?.id) return
    warmProfileImageUrl(avatarUrl)
  }, [avatarUrl, user?.id])

  useEffect(() => {
    if (!user?.id) return
    warmBusinessLogoUrl(logoUrl)
  }, [logoUrl, user?.id])

  return null
}
