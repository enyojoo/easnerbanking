"use client"

import type { ReactNode } from "react"
import { User } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { RecipientCornerFlagBadge } from "@/components/recipient-corner-flag-badge"
import { getTokenIconUrl } from "@/lib/crypto-icons"
import { isWalletBeneficiary, walletTokenAsset } from "@/lib/wallet-recipient-display"
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
 * Bank / mobile / wallet recipient row — wallet avatars use asset logo (mobile parity).
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
            <AvatarImage src={avatarUrl} alt="" />
            <AvatarFallback>{recipientInitials(fullName)}</AvatarFallback>
          </Avatar>
        ) : isWallet && tokenIconUrl ? (
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
            <img
              src={tokenIconUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <User className="h-5 w-5 text-primary" />
          </div>
        )}
        <RecipientCornerFlagBadge
          countryCode={countryCode}
          currency={currency}
          bankName={bankName}
          walletNetwork={walletNetwork}
          walletAsset={walletAsset}
        />
      </div>
      <div className={cn("min-w-0", alignEnd ? "shrink text-right" : "flex-1")}>
        <p className={cn("truncate font-medium", alignEnd && "text-right", nameClassName)}>{fullName}</p>
        <div className={cn("min-w-0 truncate", subtitleCn)}>{subtitle}</div>
      </div>
    </div>
  )
}
