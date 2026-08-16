"use client"

import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"
import type { SettingsVerificationEmbeddedFlow } from "@/lib/compliance/cutover-comms"

type SettingsVerificationTabProps = {
  fullPageFlow?: boolean
  embeddedFlow?: SettingsVerificationEmbeddedFlow | null
  onFlowOpenChange?: (open: boolean, flow?: SettingsVerificationEmbeddedFlow) => void
}

export function SettingsVerificationTab({
  fullPageFlow = false,
  embeddedFlow = null,
  onFlowOpenChange,
}: SettingsVerificationTabProps) {
  return (
    <div className={fullPageFlow ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <BusinessVerificationSection
        fullPageFlow={fullPageFlow}
        embeddedFlow={embeddedFlow}
        onFlowOpenChange={onFlowOpenChange}
      />
    </div>
  )
}
