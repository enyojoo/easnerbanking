"use client"

import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { getBeneficiaryPayoutSubtitleParts } from "@/lib/beneficiary-payout-subtitle"
import { EasenetRecipientProfileRowHydrated } from "@/components/easenet-recipient-profile-row-hydrated"
import { RecipientPayoutPreview } from "@/components/recipient-payout-preview"
import { RecipientPayoutProfileRow } from "@/components/recipient-payout-profile-row"
import { PayoutRecipientSubtitleRow } from "@/components/send/payout-recipient-subtitle-row"

type SendRecipientSummaryVariant = "selected" | "list"

/**
 * Recipient chip for send flows.
 * - `selected`: full flag / token / profile avatar, no corner badge (amount, confirm, picker button).
 * - `list`: initials + corner badge (picker dialog, settings list — mobile RecipientPayoutPreview).
 */
export function SendSelectedRecipientSummary({
  beneficiary,
  variant = "selected",
  className,
  subtitleClassName = "text-sm text-muted-foreground",
  alignEnd = false,
}: {
  beneficiary: Beneficiary
  variant?: SendRecipientSummaryVariant
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
        showEasnerMark={variant === "list"}
        className={rowClass}
        nameClassName={endClass}
        subtitleClassName={subtitleClassName}
      />
    )
  }

  if (variant === "list") {
    return (
      <RecipientPayoutPreview
        beneficiary={b}
        className={rowClass}
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
