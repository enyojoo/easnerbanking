"use client"

import { useSyncExternalStore } from "react"
import { useAuth } from "@/lib/auth-context"
import { personalSettingsStore } from "@/lib/personal-settings-store"

/**
 * Profile photo from Personal settings (`/api/settings/personal`); used in header account menu.
 *
 * Uses `useSyncExternalStore` so the URL from `personalSettingsStore` (localStorage hydrate) is
 * available on the first client paint after `hydrateSync`, instead of one frame of null from
 * `useState` + `useEffect`.
 */
export function usePersonalProfileAvatar() {
  const { user } = useAuth()
  const userId = user?.id

  const avatarUrl = useSyncExternalStore(
    (onStoreChange) => {
      if (!userId) return () => {}
      if (typeof window !== "undefined") {
        personalSettingsStore.hydrateSync(userId)
      }
      const unsub = personalSettingsStore.subscribe(onStoreChange)
      void personalSettingsStore.initialize(userId)
      return unsub
    },
    () => {
      if (!userId) return null
      if (typeof window !== "undefined") {
        personalSettingsStore.hydrateSync(userId)
      }
      return personalSettingsStore.getData()?.personal.avatarUrl ?? null
    },
    () => null,
  )

  return { avatarUrl: userId ? avatarUrl : null }
}
