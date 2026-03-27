"use client"

import { useSyncExternalStore } from "react"
import { businessInfo, getResolvedBusinessProfile } from "@/lib/business-info"

function subscribe(callback: () => void) {
  window.addEventListener("business-profile-updated", callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener("business-profile-updated", callback)
    window.removeEventListener("storage", callback)
  }
}

let cachedSnapshot: { name: string; logoUrl: string | null } | null = null

function getSnapshot() {
  const next = getResolvedBusinessProfile()
  if (cachedSnapshot && cachedSnapshot.name === next.name && cachedSnapshot.logoUrl === next.logoUrl) {
    return cachedSnapshot
  }
  cachedSnapshot = next
  return next
}

function getServerSnapshot() {
  return { name: businessInfo.name, logoUrl: null as string | null }
}

export function useBusinessProfile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
