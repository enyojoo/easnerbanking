"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BANNER_COPY } from "@/lib/copy/business-ui-copy"
import { cn } from "@/lib/utils"

type ComplianceCutoverBannerProps = {
  className?: string
}

/** Cutover banner prompting businesses to re-verify on Grid after compliance reset. */
export function ComplianceCutoverBanner({ className }: ComplianceCutoverBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        "z-20 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-50 px-8 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50",
        className,
      )}
    >
      <p className="min-w-0 flex-1">{BANNER_COPY.cutover}</p>
      <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-300 bg-white/80">
        <Link href="/settings?tab=verification">Verify now</Link>
      </Button>
    </div>
  )
}
