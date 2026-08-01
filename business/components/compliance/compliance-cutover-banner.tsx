"use client"

import { useBusinessProfile } from "@/lib/use-business-profile"
import { Button } from "@/components/ui/button"
import Link from "next/link"

/** Cutover banner prompting businesses to re-verify on Grid after compliance reset. */
export function ComplianceCutoverBanner() {
  const { tier1Complete, tier1VerificationStatus, canManageBusinessVerification, isLoading } =
    useBusinessProfile()

  if (isLoading || tier1Complete) return null
  const status = (tier1VerificationStatus ?? "not_started").toLowerCase()
  if (status !== "not_started") return null
  if (!canManageBusinessVerification) return null

  return (
    <div
      role="status"
      className="border-b border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          We upgraded business verification. Please complete verification again to restore send, receive, and
          invoice features.
        </p>
        <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-300 bg-white/80">
          <Link href="/settings#business-verification">Verify now</Link>
        </Button>
      </div>
    </div>
  )
}
