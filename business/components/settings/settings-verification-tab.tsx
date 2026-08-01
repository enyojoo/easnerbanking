"use client"

import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"

type SettingsVerificationTabProps = {
  onFlowOpenChange?: (open: boolean) => void
}

export function SettingsVerificationTab({ onFlowOpenChange }: SettingsVerificationTabProps) {
  return <BusinessVerificationSection onFlowOpenChange={onFlowOpenChange} />
}
