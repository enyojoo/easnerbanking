"use client"

import { getAppSurfaceFromHostname, type ProductSurface } from "@/lib/app-surface"
import { useAppSurfaceContext } from "@/components/app-surface-provider"
import { useClientHostname } from "@/lib/use-client-hostname"

/** Context after mount; env/hostname fallback when the provider is absent. */
export function useAppSurface(): ProductSurface {
  const ctx = useAppSurfaceContext()
  const hostname = useClientHostname()
  if (ctx) return ctx.surface
  return getAppSurfaceFromHostname(hostname)
}

export function useSetAppSurface(): ((surface: ProductSurface) => void) | null {
  return useAppSurfaceContext()?.setSurface ?? null
}

export function useApplyStoredAppSurface(): (() => ProductSurface) | undefined {
  return useAppSurfaceContext()?.applyStoredSurface
}
