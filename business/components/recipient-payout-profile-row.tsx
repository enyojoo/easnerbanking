"use client"

import type { ReactNode } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CountryFlag } from "@/components/flags"
import { getTokenIconUrl } from "@/lib/crypto-icons"
import { normalizeProfileImageUrl } from "@/lib/image-cache"
import {
  isWalletBeneficiary,
  resolvePayoutCountryCode,
  walletTokenAsset,
} from "@/lib/wallet-recipient-display"
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

const avatarFillClass =
  "size-full min-h-0 min-w-0 rounded-full [&_img]:size-full [&_img]:rounded-full [&_img]:object-cover [&_img]:object-center"

type RecipientPayoutProfileRowProps = {
  fullName: string
  subtitle: ReactNode
  currency: string
  countryCode?: string | null
  bankName?: string | null
  walletNetwork?: string | null
  walletAsset?: string | null
  avatarUrl?: string | null
  className?: string
  nameClassName?: string
  subtitleClassName?: string
  /** Right-align name + subtitle (review/confirm rows). */
  alignEnd?: boolean
}

/**
 * Selected payout recipient – full flag or token avatar, no corner badge (mobile SendSelectedRecipientSummary).
 */
export function RecipientPayoutProfileRow({
  fullName,
  subtitle,
  currency,
  countryCode,
  bankName,
  walletNetwork,
  walletAsset,
  avatarUrl,
  className,
  nameClassName,
  subtitleClassName,
  alignEnd = false,
}: RecipientPayoutProfileRowProps) {
  const subtitleCn = subtitleClassName ?? "text-sm text-muted-foreground"
  const isWallet = isWalletBeneficiary({ bankName, walletNetwork, walletAsset })
  const tokenAsset = walletTokenAsset({ walletAsset, currency })
  const tokenIconUrl = isWallet ? getTokenIconUrl(tokenAsset) : undefined
  const payoutCountryCode = resolvePayoutCountryCode(countryCode, currency)

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        alignEnd && "flex-row-reverse justify-end",
        className,
      )}
    >
      <div className="relative mr-1 shrink-0">
        {avatarUrl ? (
          <Avatar className="h-10 w-10 border border-border">
            {/*
              Normalized (versioned) URL: the bare URL is a DIFFERENT string
              from the one the warm bootstrap and the recipient list use, so
              the same photo was fetched twice and always popped in here.
            */}
            <AvatarImage src={normalizeProfileImageUrl(avatarUrl) ?? avatarUrl} alt="" />
            <AvatarFallback>{recipientInitials(fullName)}</AvatarFallback>
          </Avatar>
        ) : isWallet && tokenIconUrl ? (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
            <img src={tokenIconUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
            <CountryFlag code={payoutCountryCode} className={avatarFillClass} title={payoutCountryCode} />
          </div>
        )}
      </div>
      <div className={cn("min-w-0", alignEnd ? "shrink text-right" : "flex-1")}>
        <p className={cn("truncate font-medium", alignEnd && "text-right", nameClassName)}>{fullName}</p>
        <div className={cn("min-w-0 truncate", subtitleCn)}>{subtitle}</div>
      </div>
    </div>
  )
}
