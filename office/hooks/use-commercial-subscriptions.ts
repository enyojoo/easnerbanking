"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"
import { CACHE_KEYS } from "@/lib/cache"

export function useCommercialSubscriptions() {
  const loader = useCallback(() => commercialApi.listSubscriptions(), [])
  return useCommercialResource(loader, {
    cacheKey: CACHE_KEYS.COMMERCIAL_SUBSCRIPTIONS,
    persistKey: "office_commercial_subscriptions",
  })
}
