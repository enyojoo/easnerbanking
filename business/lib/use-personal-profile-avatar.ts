"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { personalSettingsStore } from "@/lib/personal-settings-store"

/** Profile photo from Personal settings (auth user_metadata); used in header account menu. */
export function usePersonalProfileAvatar() {
  const { user } = useAuth()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) {
      setAvatarUrl(null)
      return
    }

    personalSettingsStore.hydrateSync(user.id)
    const d = personalSettingsStore.getData()
    setAvatarUrl(d?.personal.avatarUrl ?? null)

    const unsub = personalSettingsStore.subscribe(() => {
      const next = personalSettingsStore.getData()
      setAvatarUrl(next?.personal.avatarUrl ?? null)
    })

    void personalSettingsStore.initialize(user.id)

    return unsub
  }, [user?.id])

  return { avatarUrl }
}
