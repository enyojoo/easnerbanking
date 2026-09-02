"use client"

import {
  walletSendDailyLimitCopy,
  walletSendVelocityBannerCopy,
  type ResolvedSendAllowance,
} from "@easner/shared"

export function WalletSendComplianceBanner({
  stablecoin,
  velocityEnforced,
}: {
  stablecoin: ResolvedSendAllowance
  velocityEnforced: boolean
}) {
  const nearDaily =
    stablecoin.dailyLimitUsd > 0 &&
    stablecoin.dailyRemainingUsd <= stablecoin.dailyLimitUsd * 0.1
  const showVelocity = velocityEnforced && stablecoin.velocityActive
  if (!showVelocity && !nearDaily) return null

  const copy = showVelocity
    ? walletSendVelocityBannerCopy(stablecoin.velocityExpiresAt)
    : walletSendDailyLimitCopy(null)

  return (
    <div
      className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.12)] px-8 py-2.5 text-sm text-[hsl(var(--warning))] backdrop-blur-sm"
      role="status"
    >
      <span>
        {showVelocity
          ? copy
          : `You are close to today’s external transfer limit. About $${Math.round(stablecoin.dailyRemainingUsd).toLocaleString()} remaining.`}
      </span>
    </div>
  )
}
