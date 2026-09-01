"use client"

import { Card, CardContent } from "@/components/ui/card"
import { accountRestrictionWindDownBannerCopy, type ResolvedAccountRestriction } from "@easner/shared"

export function AccountRestrictionBanner({ restriction }: { restriction: ResolvedAccountRestriction }) {
  if (!restriction.active || restriction.phase !== "wind_down") return null

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30">
      <CardContent className="p-4 text-sm text-amber-950 dark:text-amber-100">
        {accountRestrictionWindDownBannerCopy(restriction.windDownEndsAt)}
      </CardContent>
    </Card>
  )
}
