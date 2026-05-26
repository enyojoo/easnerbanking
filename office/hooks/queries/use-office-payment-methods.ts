"use client"

import { useQuery } from "@tanstack/react-query"
import { paymentMethodsApi } from "@/lib/payment-methods-api"
import { officeKeys } from "@/lib/query/keys"
import { OFFICE_REFERENCE_STALE_MS } from "./constants"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficePaymentMethods() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.paymentMethods(),
    enabled,
    staleTime: OFFICE_REFERENCE_STALE_MS,
    queryFn: () => paymentMethodsApi.list(),
  })
}
