"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { PaymentsPayoutSkeleton } from "@/components/collections/collections-skeletons"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { PAYMENTS_SETTINGS_COPY } from "@/lib/copy/business-ui-copy"
import { formatCurrency } from "@/lib/utils"

export function PaymentsConnectionStatusCard() {
  const { onlinePaymentsEnabled } = useBusinessProfile()
  const { accountRows, loading } = useBusinessAccountRows()

  if (onlinePaymentsEnabled === false) {
    return null
  }

  const account = accountRows.find((row) => row.currency === "USD") ?? null
  const showSkeleton = loading && accountRows.length === 0
  const amount = account?.availableBalance ?? account?.balance ?? 0

  return (
    <Card>
      <CardHeader>
        <SettingsCardHeader
          title={<CardTitle>{PAYMENTS_SETTINGS_COPY.payoutTitle}</CardTitle>}
          description={PAYMENTS_SETTINGS_COPY.payoutIntro}
        />
      </CardHeader>
      <CardContent>
        {showSkeleton ? (
          <PaymentsPayoutSkeleton />
        ) : (
          <Link
            href="/accounts"
            className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/40 sm:p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <CurrencyFlagCircle currency="USD" size={36} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{PAYMENTS_SETTINGS_COPY.payoutAccountLabel}</p>
                <p className="text-xs text-muted-foreground">{PAYMENTS_SETTINGS_COPY.payoutAccountHint}</p>
              </div>
            </div>
            <p className="shrink-0 text-base font-semibold tabular-nums tracking-tight sm:text-lg">
              {formatCurrency(amount, "USD")}
            </p>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
