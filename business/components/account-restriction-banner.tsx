"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { openBusinessSupport } from "@/lib/intercom-messenger"
import {
  ACCOUNT_RESTRICTION_WIND_DOWN_BANNER,
  ACCOUNT_RESTRICTION_WIND_DOWN_CONTACT_CTA,
  type ResolvedAccountRestriction,
} from "@easner/shared"

export function AccountRestrictionBanner({ restriction }: { restriction: ResolvedAccountRestriction }) {
  if (!restriction.active || restriction.phase !== "wind_down") return null

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-amber-950 dark:text-amber-100">{ACCOUNT_RESTRICTION_WIND_DOWN_BANNER}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-950/60"
          onClick={() => {
            void openBusinessSupport()
          }}
        >
          {ACCOUNT_RESTRICTION_WIND_DOWN_CONTACT_CTA}
        </Button>
      </CardContent>
    </Card>
  )
}
