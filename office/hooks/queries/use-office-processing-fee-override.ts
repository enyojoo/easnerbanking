"use client"

import { useQuery } from "@tanstack/react-query"
import {
  processingFeeOverridesApi,
  type ProcessingFeeOverrideRow,
  type ProcessingFeeOverrideSubjectType,
} from "@/lib/processing-fee-overrides-api"
import { officeKeys } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeProcessingFeeOverride(
  subjectType: ProcessingFeeOverrideSubjectType | null,
  subjectId: string | null,
) {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.processingFeeOverride(subjectType ?? "none", subjectId ?? "none"),
    enabled: enabled && subjectType != null && Boolean(subjectId),
    ...officeReferenceQueryDefaults,
    queryFn: (): Promise<ProcessingFeeOverrideRow | null> =>
      processingFeeOverridesApi.get(subjectType!, subjectId!),
  })
}
