"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"

export function useCommercialLimits() {
  const loader = useCallback(() => commercialApi.listLimits(), [])
  return useCommercialResource(loader)
}
