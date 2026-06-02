"use client"

import { CountryFlag, CurrencyFlag } from "@/components/flags"
import { getTokenIconUrl } from "@/lib/crypto-icons"
import { isWalletBeneficiary, walletTokenAsset } from "@/lib/wallet-recipient-display"
import { cn } from "@/lib/utils"

const flagCropClass =
  "size-full min-h-0 min-w-0 rounded-full [&_img]:size-full [&_img]:rounded-full [&_img]:object-cover [&_img]:object-center"

type RecipientCornerFlagBadgeProps = {
  countryCode?: string | null
  currency: string
  bankName?: string | null
  walletNetwork?: string | null
  walletAsset?: string | null
  className?: string
}

/**
 * Circular corner badge on recipient avatars (bank / mobile / wallet).
 * Wallet rows use the asset token logo; fiat uses country or currency flag.
 */
export function RecipientCornerFlagBadge({
  countryCode,
  currency,
  bankName,
  walletNetwork,
  walletAsset,
  className,
}: RecipientCornerFlagBadgeProps) {
  const isWallet = isWalletBeneficiary({ bankName, walletNetwork, walletAsset })
  const asset = walletTokenAsset({ walletAsset, currency })
  const tokenIcon = isWallet ? getTokenIconUrl(asset) : undefined
  const cc = String(countryCode || "").trim().toUpperCase()

  return (
    <div
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-5 w-5 overflow-hidden rounded-full border-2 border-background bg-background p-0",
        className,
      )}
      aria-hidden
    >
      {isWallet && tokenIcon ? (
        <img src={tokenIcon} alt="" className={flagCropClass} />
      ) : cc ? (
        <CountryFlag code={cc} className={flagCropClass} title={cc} />
      ) : (
        <CurrencyFlag currency={currency} className={flagCropClass} title={currency} />
      )}
    </div>
  )
}
