"use client"

import { useEffect } from "react"
import { warmWebFlagCache } from "@easner/shared"
import { useAuth } from "@/lib/auth-context"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { usePersonalProfileAvatar } from "@/lib/use-personal-profile-avatar"
import { warmBusinessLogoUrl, warmProfileImageUrl } from "@/lib/image-cache"

/** Prefetch flags and user/org images once per app session. */
export function ImageWarmBootstrap() {
  const { user } = useAuth()
  const { logoUrl } = useBusinessProfile()
  const { avatarUrl } = usePersonalProfileAvatar()

  useEffect(() => {
    warmWebFlagCache()
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
