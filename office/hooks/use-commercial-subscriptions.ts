"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"

export function useCommercialSubscriptions() {
  const loader = useCallback(() => commercialApi.listSubscriptions(), [])
  return useCommercialResource(loader)
}
