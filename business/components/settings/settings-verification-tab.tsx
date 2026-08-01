"use client"

import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"

export function SettingsVerificationTab({
  onFlowOpenChange,
}: {
  onFlowOpenChange?: (open: boolean) => void
}) {
  return <BusinessVerificationSection onFlowOpenChange={onFlowOpenChange} />
}
