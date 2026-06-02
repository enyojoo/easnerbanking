"use client"

import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { getBeneficiaryPayoutSubtitleParts } from "@/lib/beneficiary-payout-subtitle"
import { RecipientCornerFlagBadge } from "@/components/recipient-corner-flag-badge"
import { PayoutRecipientSubtitleRow } from "@/components/send/payout-recipient-subtitle-row"
import { cn } from "@/lib/utils"

function recipientInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  )
}

/**
 * Payout recipient list row — initials avatar + corner badge (mobile RecipientPayoutPreview).
 */
export function RecipientPayoutPreview({
  beneficiary,
  className,
  subtitleClassName = "text-sm text-muted-foreground",
}: {
  beneficiary: Beneficiary
  className?: string
  subtitleClassName?: string
}) {
  const b = coerceBeneficiaryEasenetDisplay(beneficiary)
  const { left, right } = getBeneficiaryPayoutSubtitleParts(b)

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative mr-1 shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <span className="text-sm font-semibold text-primary">{recipientInitials(b.name)}</span>
        </div>
        <RecipientCornerFlagBadge
          countryCode={b.countryCode}
          currency={b.currency}
          bankName={b.bankName}
          walletNetwork={b.walletNetwork}
          walletAsset={b.walletAsset}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{b.name}</p>
        <PayoutRecipientSubtitleRow left={left} right={right} className={subtitleClassName} />
      </div>
    </div>
  )
}
