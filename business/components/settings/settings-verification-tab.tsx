"use client"

import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"

type SettingsVerificationTabProps = {
  fullPageFlow?: boolean
}

export function SettingsVerificationTab({ fullPageFlow = false }: SettingsVerificationTabProps) {
  return <BusinessVerificationSection fullPageFlow={fullPageFlow} />
}
