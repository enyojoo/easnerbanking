"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"
import { CACHE_KEYS } from "@/lib/cache"

export function useCommercialPlans() {
  const loader = useCallback(() => commercialApi.listPlans(), [])
  return useCommercialResource(loader, {
    cacheKey: CACHE_KEYS.COMMERCIAL_PLANS,
    persistKey: "office_commercial_plans",
  })
}
