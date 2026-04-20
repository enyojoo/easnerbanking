"use client"

import { useCallback } from "react"
import { commercialApi } from "@/lib/commercial-api"
import { useCommercialResource } from "@/hooks/use-commercial-resource"
import { officeKeys } from "@/lib/query/keys"

export function useCommercialRules() {
  const loader = useCallback(() => commercialApi.listRules(), [])
  return useCommercialResource(loader, {
    queryKey: officeKeys.commercial.rules(),
  })
}
