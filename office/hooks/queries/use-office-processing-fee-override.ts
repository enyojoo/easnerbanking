"use client"

import { useQuery } from "@tanstack/react-query"
import {
  processingFeeOverridesApi,
  type ProcessingFeeOverrideGetResult,
  type ProcessingFeeOverrideSubjectType,
} from "@/lib/processing-fee-overrides-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeProcessingFeeOverride(
  subjectType: ProcessingFeeOverrideSubjectType | null,
  subjectId: string | null,
) {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("reference")

  return useQuery({
    queryKey: officeKeys.processingFeeOverride(subjectType ?? "none", subjectId ?? "none"),
    enabled: enabled && subjectType != null && Boolean(subjectId),
    retry: false,
    ...officeReferenceQueryDefaults,
    refetchInterval,
    queryFn: (): Promise<ProcessingFeeOverrideGetResult> =>
      processingFeeOverridesApi.get(subjectType!, subjectId!),
  })
}
