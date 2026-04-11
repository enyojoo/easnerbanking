"use client"

import { useSyncExternalStore } from "react"
import {
  getEasenetPublicProfileCacheSnapshot,
  subscribeEasenetPublicProfileCache,
} from "@/lib/easenet-public-profile-cache"

/**
 * Subscribes to the easetag public-profile cache (memory + localStorage) with a stable snapshot
 * for useSyncExternalStore so avatars can render from cache on the client without waiting on network.
 */
export function useEasenetPublicProfileCacheSnapshot(easetag: string) {
  return useSyncExternalStore(
    subscribeEasenetPublicProfileCache,
    () => getEasenetPublicProfileCacheSnapshot(easetag),
    () => null,
  )
}
