"use client"

import { useMemo } from "react"
import { BRAND } from "@/components/brand/brand-constants"
import { cn } from "@/lib/utils"
import { getPostHog } from "@/lib/posthog"
import {
  buildEasnerBusinessMarketingUrl,
  type EasnerBusinessMarketingCampaign,
} from "@/lib/posthog-attribution"

type Props = {
  className?: string
  /** Attribution campaign for easner.com/business → business signup funnel. */
  campaign?: EasnerBusinessMarketingCampaign | string
}

/** Same “Powered by Easner Business” mark used on invoices, payment links, and Checkout. */
export function PoweredByEasner({ className, campaign = "powered_by" }: Props) {
  const href = useMemo(() => {
    const ph = getPostHog() as { get_distinct_id?: () => string } | null
    const distinctId =
      typeof ph?.get_distinct_id === "function" ? ph.get_distinct_id() : null
    return buildEasnerBusinessMarketingUrl({ campaign, distinctId })
  }, [campaign])

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>Powered by</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center"
      >
        <img
          src={BRAND.logoBusinessLight}
          alt="Easner Business"
          className="h-5 w-auto object-contain dark:hidden sm:h-6"
        />
        <img
          src={BRAND.logoBusinessDark}
          alt="Easner Business"
          className="hidden h-5 w-auto object-contain dark:block sm:h-6"
        />
      </a>
    </div>
  )
}
