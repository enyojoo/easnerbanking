"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CurrencyFlag } from "@/components/flags"
import { SettingsCardHeader } from "@/components/settings/settings-card-header"
import { PaymentsPayoutSkeleton } from "@/components/collections/collections-skeletons"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { PAYMENTS_SETTINGS_COPY } from "@/lib/copy/business-ui-copy"
import type { Account } from "@/lib/finance-types"

function settlementAccount(rows: Account[]): Account | null {
  const usd = rows.find((row) => row.currency === "USD" && row.bankName && row.bankName !== "—")
  if (usd) return usd
  return rows.find((row) => row.bankName && row.bankName !== "—") ?? null
}

function maskedAccount(row: Account): string {
  const digits = (row.fullAccountNumber || row.accountNumber).replace(/\D/g, "")
  const last4 = digits.slice(-4)
  if (last4.length === 4) return `•••• ${last4}`
  return row.accountNumber !== "—" ? row.accountNumber : ""
}

export function PaymentsConnectionStatusCard() {
  const { onlinePaymentsEnabled } = useBusinessProfile()
  const { accountRows, loading } = useBusinessAccountRows()

  if (onlinePaymentsEnabled === false) {
    return null
  }

  const account = settlementAccount(accountRows)
  const showSkeleton = loading && !account
  const mask = account ? maskedAccount(account) : ""

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
        ) : account ? (
          <div className="flex items-start gap-3 rounded-2xl border p-4">
            <CurrencyFlag currency={account.currency} size={36} className="shrink-0 rounded-md" />
            <div className="min-w-0">
              <p className="font-semibold leading-snug text-foreground">
                {account.currency} Balance
              </p>
              <p className="text-sm text-muted-foreground">{account.bankName}</p>
              {mask ? <p className="font-mono text-sm text-muted-foreground">{mask}</p> : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{PAYMENTS_SETTINGS_COPY.payoutPending}</p>
        )}
      </CardContent>
    </Card>
  )
}
