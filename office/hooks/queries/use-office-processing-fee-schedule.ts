"use client"

import { useQuery } from "@tanstack/react-query"
import {
  processingFeeScheduleApi,
  type ProcessingFeeScheduleRow,
  type ProcessingFeeScheduleScope,
} from "@/lib/processing-fee-schedule-api"
import { officeKeys } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeProcessingFeeSchedule(scope: ProcessingFeeScheduleScope | null) {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.processingFeeSchedule(scope ?? "none"),
    enabled: enabled && scope != null,
    ...officeReferenceQueryDefaults,
    queryFn: (): Promise<ProcessingFeeScheduleRow[]> => processingFeeScheduleApi.list(scope!),
  })
}
