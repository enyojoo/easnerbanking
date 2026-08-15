"use client"

import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"

type SettingsVerificationTabProps = {
  fullPageFlow?: boolean
  onFlowOpenChange?: (open: boolean) => void
}

export function SettingsVerificationTab({
  fullPageFlow = false,
  onFlowOpenChange,
}: SettingsVerificationTabProps) {
  return (
    <BusinessVerificationSection fullPageFlow={fullPageFlow} onFlowOpenChange={onFlowOpenChange} />
  )
}
