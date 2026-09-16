"use client"

import { useQuery } from "@tanstack/react-query"
import type { AppSurface } from "@/lib/auth/app-surface-access"

export type PlatformAccessSnapshot = {
  surface: AppSurface
  maintenance: boolean
  registration: boolean
  maintenanceMessage: string
  registrationMessage: string
  minNativeVersion: string
}

const POLL_MS = 15_000

async function fetchPlatformAccess(surface: AppSurface): Promise<PlatformAccessSnapshot> {
  const res = await fetch(`/api/platform/access?surface=${encodeURIComponent(surface)}`, {
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as Partial<PlatformAccessSnapshot> & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || "Failed to load platform access")
  }
  return {
    surface,
    maintenance: Boolean(data.maintenance),
    registration: data.registration !== false,
    maintenanceMessage: data.maintenanceMessage || "This product is temporarily unavailable.",
    registrationMessage: data.registrationMessage || "New accounts are not being accepted right now.",
    minNativeVersion: typeof data.minNativeVersion === "string" ? data.minNativeVersion : "",
  }
}

export function usePlatformAccess(surface: AppSurface) {
  return useQuery({
    queryKey: ["platform-access", surface],
    queryFn: () => fetchPlatformAccess(surface),
    staleTime: 0,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
  })
}
