"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyFlagCircle } from "@/components/currency-flag-circle"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { PaymentsPayoutSkeleton } from "@/components/collections/collections-skeletons"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { PAYMENTS_SETTINGS_COPY } from "@/lib/copy/business-ui-copy"

export function PaymentsConnectionStatusCard() {
  const { onlinePaymentsEnabled } = useBusinessProfile()
  const { accountRows, loading } = useBusinessAccountRows()

  if (onlinePaymentsEnabled === false) {
    return null
  }

  const account =
    accountRows.find((row) => row.currency === "USD") ?? accountRows[0] ?? null
  const currency = account?.currency ?? "USD"
  const showSkeleton = loading && accountRows.length === 0

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
          <div className="flex items-center gap-2">
            <CurrencyFlagCircle currency={currency} size={24} />
            <span className="text-sm font-semibold text-foreground">{currency}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
