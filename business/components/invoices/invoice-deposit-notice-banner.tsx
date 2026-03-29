"use client"

import Link from "next/link"
import { Info } from "lucide-react"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"
import { cn } from "@/lib/utils"

/**
 * B2B: invoicing works before KYB; bank/stablecoin pay-in details for customers are provisioned only after tiers.
 */
export function InvoiceDepositNoticeBanner({ className }: { className?: string }) {
  const { tier1Complete, isLoading } = useBusinessProfile()
  if (isLoading) return null
  if (tier1Complete && TIER2_COMPLETE_PLACEHOLDER) return null

  return (
    <div
      className={cn(
        "rounded-lg border border-sky-200/90 bg-sky-50/80 px-4 py-3 text-sm text-foreground/90 dark:border-sky-900/50 dark:bg-sky-950/30",
        className,
      )}
      role="status"
    >
      <div className="flex gap-3">
        <Info className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
        <div className="space-y-2 min-w-0">
          {!tier1Complete ? (
            <p>
              <span className="font-medium">Invoicing works as usual.</span> Bank and stablecoin deposit instructions for
              your customers are not provisioned on invoices or PDFs until your organization completes business
              verification.{" "}
              <Link href="/settings?tab=business" className="font-semibold text-primary underline underline-offset-2">
                Business verification
              </Link>
            </p>
          ) : (
            <p>
              <span className="font-medium">Invoicing works as usual.</span> NGN and other local pay-in instructions on
              invoices and PDFs are added when African banking is enabled for your organization.
            </p>
          )}
          {!tier1Complete && !TIER2_COMPLETE_PLACEHOLDER ? (
            <p className="text-xs text-muted-foreground">
              African banking and regional pay-in/pay-out are separate from global USD/EUR/GBP deposit details.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
