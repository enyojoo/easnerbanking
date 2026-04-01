"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"
import { CACHE_KEYS } from "@/lib/cache"

export function useCommercialLimits() {
  const loader = useCallback(() => commercialApi.listLimits(), [])
  return useCommercialResource(loader, {
    cacheKey: CACHE_KEYS.COMMERCIAL_LIMITS,
    persistKey: "office_commercial_limits",
  })
}
