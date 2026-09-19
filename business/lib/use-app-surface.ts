"use client"

import { getAppSurfaceFromHostname, type ProductSurface } from "@/lib/app-surface"
import { useClientHostname } from "@/lib/use-client-hostname"

/** Env on first paint, hostname after mount (no hydration mismatch). */
export function useAppSurface(): ProductSurface {
  return getAppSurfaceFromHostname(useClientHostname())
}
