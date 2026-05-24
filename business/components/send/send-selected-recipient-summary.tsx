"use client"

import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { getBeneficiaryPayoutSubtitleParts } from "@/lib/beneficiary-payout-subtitle"
import { EasenetRecipientProfileRowHydrated } from "@/components/easenet-recipient-profile-row-hydrated"
import { RecipientPayoutProfileRow } from "@/components/recipient-payout-profile-row"
import { PayoutRecipientSubtitleRow } from "@/components/send/payout-recipient-subtitle-row"

/** Avatar + name + subtitle for send amount / review (parity with mobile SendSelectedRecipientSummary). */
export function SendSelectedRecipientSummary({
  beneficiary,
  className,
  subtitleClassName = "text-sm text-muted-foreground",
}: {
  beneficiary: Beneficiary
  className?: string
  subtitleClassName?: string
}) {
  const b = coerceBeneficiaryEasenetDisplay(beneficiary)

  if (b.payeeEasetag) {
    return (
      <EasenetRecipientProfileRowHydrated
        fullName={b.name}
        easetag={b.payeeEasetag}
        accountKind={b.payeeAccountKind}
        avatarUrl={b.avatarUrl}
        className={className ?? "min-w-0 flex-1"}
        subtitleClassName={subtitleClassName}
      />
    )
  }

  const { left, right } = getBeneficiaryPayoutSubtitleParts(b)

  return (
    <RecipientPayoutProfileRow
      fullName={b.name}
      countryCode={b.countryCode}
      currency={b.currency}
      avatarUrl={b.avatarUrl}
      subtitle={<PayoutRecipientSubtitleRow left={left} right={right} className={subtitleClassName} />}
      className={className ?? "min-w-0 flex-1"}
      subtitleClassName={subtitleClassName}
    />
  )
}
