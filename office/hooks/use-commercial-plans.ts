"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"

export function useCommercialPlans() {
  const loader = useCallback(() => commercialApi.listPlans(), [])
  return useCommercialResource(loader)
}
