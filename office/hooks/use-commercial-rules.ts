"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"
import { CACHE_KEYS } from "@/lib/cache"

export function useCommercialRules() {
  const loader = useCallback(() => commercialApi.listRules(), [])
  return useCommercialResource(loader, {
    cacheKey: CACHE_KEYS.COMMERCIAL_RULES,
    persistKey: "office_commercial_rules",
  })
}
