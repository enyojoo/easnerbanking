"use client"

import {
  ACCOUNT_RESTRICTION_WIND_DOWN_CONTACT_CTA,
  accountRestrictionWindDownBannerCopy,
  type ResolvedAccountRestriction,
} from "@easner/shared"
import { openBusinessSupport } from "@/lib/intercom-messenger"

/** Full-width strip matching KYB verification banners in `dashboard-shell`. */
export function AccountRestrictionBanner({ restriction }: { restriction: ResolvedAccountRestriction }) {
  if (!restriction.active || restriction.phase !== "wind_down") return null

  return (
    <div
      className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.12)] px-8 py-2.5 text-sm text-[hsl(var(--warning))] backdrop-blur-sm"
      role="status"
    >
      <span>{accountRestrictionWindDownBannerCopy(restriction.windDownEndsAt)}</span>
      <button
        type="button"
        className="font-semibold text-[hsl(var(--warning))] underline underline-offset-2"
        onClick={() => {
          void openBusinessSupport()
        }}
      >
        {ACCOUNT_RESTRICTION_WIND_DOWN_CONTACT_CTA}
      </button>
    </div>
  )
}
