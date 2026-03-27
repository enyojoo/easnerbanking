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

function getSnapshot() {
  return getResolvedBusinessProfile()
}

function getServerSnapshot() {
  return { name: businessInfo.name, logoUrl: null as string | null }
}

export function useBusinessProfile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
