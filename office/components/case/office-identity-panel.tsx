"use client"

import { formatOfficeDate } from "@/lib/format-office-date"
import { displayText } from "@/lib/case/status"
import type { OfficeIdentityUser } from "@/lib/case/types"
import { OfficeDetailRow, OfficeSection } from "./office-detail-grid"
import { mapNoahIdTypeLabel } from "@easner/shared"
import { isBridgeNewYorkResidence, isBridgeOnboardableResidence } from "@easner/shared"

export function OfficeIdentityPanel({
  user,
  showBankRail = true,
  profileTitle = "Profile",
}: {
  user: OfficeIdentityUser
  showBankRail?: boolean
  profileTitle?: string
}) {
  const country = user.kyc_address_country || user.residence_country
  const geo = { countryCode: country, state: user.kyc_address_state }
  const bridgeGeo = isBridgeOnboardableResidence(geo) && !isBridgeNewYorkResidence(geo)
  const address = [
    user.kyc_address_street,
    user.kyc_address_city,
    user.kyc_address_state,
    user.kyc_address_post_code,
    user.kyc_address_country || user.residence_country,
  ]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(", ")

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <OfficeSection title={profileTitle}>
        <OfficeDetailRow label="Name">{displayText(user.full_name)}</OfficeDetailRow>
        <OfficeDetailRow label="Email">{displayText(user.email)}</OfficeDetailRow>
        <OfficeDetailRow label="Phone">{displayText(user.phone)}</OfficeDetailRow>
        <OfficeDetailRow label="Date of birth">
          {user.date_of_birth ? formatOfficeDate(user.date_of_birth) : "–"}
        </OfficeDetailRow>
        <OfficeDetailRow label="Easetag">{user.easetag ? `@${user.easetag}` : "–"}</OfficeDetailRow>
      </OfficeSection>
      <OfficeSection title="Identity">
        <OfficeDetailRow label="ID type">{displayText(mapNoahIdTypeLabel(user.kyc_id_type))}</OfficeDetailRow>
        <OfficeDetailRow label="ID number" mono>
          {displayText(user.kyc_id_number)}
        </OfficeDetailRow>
        <OfficeDetailRow label="Issuing country">{displayText(user.kyc_id_issuing_country)}</OfficeDetailRow>
        <OfficeDetailRow label="Address">{address || "–"}</OfficeDetailRow>
        <OfficeDetailRow label="Residence">{displayText(user.residence_country || user.kyc_address_country)}</OfficeDetailRow>
        {showBankRail ? (
          <OfficeDetailRow label="Bank KYC rail">{bridgeGeo ? "Bridge" : "Noah"}</OfficeDetailRow>
        ) : null}
      </OfficeSection>
    </div>
  )
}
