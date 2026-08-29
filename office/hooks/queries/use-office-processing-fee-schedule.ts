"use client"

import { useQuery } from "@tanstack/react-query"
import {
  processingFeeScheduleApi,
  type ProcessingFeeScheduleRow,
  type ProcessingFeeScheduleScope,
} from "@/lib/processing-fee-schedule-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeProcessingFeeSchedule(
  scope: ProcessingFeeScheduleScope,
): Promise<ProcessingFeeScheduleRow[]> {
  return processingFeeScheduleApi.list(scope)
}

/**
 * Options for a concrete (non-null) scope, consumed by both
 * `useOfficeProcessingFeeSchedule` and `primeOfficeNav`.
 */
export function officeProcessingFeeScheduleQueryOptions(scope: ProcessingFeeScheduleScope) {
  return {
    queryKey: officeKeys.processingFeeSchedule(scope),
    queryFn: () => fetchOfficeProcessingFeeSchedule(scope),
    ...officeReferenceQueryDefaults,
  }
}

export function useOfficeProcessingFeeSchedule(scope: ProcessingFeeScheduleScope | null) {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("reference")

  return useQuery({
    queryKey: officeKeys.processingFeeSchedule(scope ?? "none"),
    enabled: enabled && scope != null,
    ...officeReferenceQueryDefaults,
    refetchInterval,
    queryFn: () => fetchOfficeProcessingFeeSchedule(scope!),
  })
}
