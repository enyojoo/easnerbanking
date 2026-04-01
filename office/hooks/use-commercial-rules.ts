"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"

export function useCommercialRules() {
  const loader = useCallback(() => commercialApi.listRules(), [])
  return useCommercialResource(loader)
}
