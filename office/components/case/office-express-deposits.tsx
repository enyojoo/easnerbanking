"use client"

import { Badge } from "@/components/ui/badge"
import { expressDepositsOfficeStatus, expressDepositsTierLabel } from "@/lib/case/express-deposits"
import { officeVerificationBadgeVariant } from "@/lib/case/status"
import { verificationStatusLabel } from "@easner/shared"
import { OfficeCopyValue } from "./office-copy-value"
import { OfficeDetailRow, OfficeSection } from "./office-detail-grid"

export function OfficeExpressDepositsSection({
  status,
  tier,
  customerId,
  ownerLabel,
}: {
  status?: string | null
  tier?: string | null
  customerId?: string | null
  ownerLabel?: string | null
}) {
  const normalized = expressDepositsOfficeStatus(status)
  const tierLabel = expressDepositsTierLabel(tier)
  return (
    <OfficeSection
      title="Express deposits"
      description={
        ownerLabel
          ? `Stripe verification on ${ownerLabel}`
          : "Stripe verification for card and wallet deposits"
      }
      action={
        <Badge variant={officeVerificationBadgeVariant(normalized)}>
          {verificationStatusLabel(normalized, { detail: true })}
        </Badge>
      }
    >
      <OfficeCopyValue label="Stripe · customer" value={customerId} />
      <OfficeDetailRow label="KYC tier">{tierLabel || "–"}</OfficeDetailRow>
    </OfficeSection>
  )
}
