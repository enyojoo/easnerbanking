"use client"

import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { getBeneficiaryPayoutSubtitleParts } from "@/lib/beneficiary-payout-subtitle"
import { EasenetRecipientProfileRowHydrated } from "@/components/easenet-recipient-profile-row-hydrated"
import { RecipientPayoutProfileRow } from "@/components/recipient-payout-profile-row"
import { PayoutRecipientSubtitleRow } from "@/components/send/payout-recipient-subtitle-row"

/** Recipient row – full flag / token / profile avatar everywhere (no corner badges). */
export function SendSelectedRecipientSummary({
  beneficiary,
  className,
  subtitleClassName = "text-sm text-muted-foreground",
  alignEnd = false,
}: {
  beneficiary: Beneficiary
  className?: string
  subtitleClassName?: string
  /** Review/confirm: chip aligns flush right with amount rows. */
  alignEnd?: boolean
}) {
  const b = coerceBeneficiaryEasenetDisplay(beneficiary)
  const endClass = alignEnd ? "text-right" : undefined
  const rowClass = className ?? (alignEnd ? "min-w-0 shrink-0" : "min-w-0 flex-1")

  if (b.payeeEasetag) {
    return (
      <EasenetRecipientProfileRowHydrated
        fullName={b.name}
        easetag={b.payeeEasetag}
        accountKind={b.payeeAccountKind}
        avatarUrl={b.avatarUrl}
        className={rowClass}
        nameClassName={endClass}
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
      bankName={b.bankName}
      walletNetwork={b.walletNetwork}
      walletAsset={b.walletAsset}
      avatarUrl={b.avatarUrl}
      subtitle={<PayoutRecipientSubtitleRow left={left} right={right} className={subtitleClassName} />}
      alignEnd={alignEnd}
      className={rowClass}
      nameClassName={endClass}
      subtitleClassName={subtitleClassName}
    />
  )
}
