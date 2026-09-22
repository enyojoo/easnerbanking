"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  consumerBankKycRail,
  officeProviderLabel,
  officeStatusIsApproved,
} from "@/lib/case/status"
import type { OfficeBankingPayload, OfficeIdentityUser, OfficeVirtualAccount } from "@/lib/case/types"
import { OfficeCopyValue } from "./office-copy-value"
import { OfficeDetailRow, OfficeSection } from "./office-detail-grid"
import { OfficePartnerSync } from "./office-partner-sync"
import { useOfficePayoutCorridors } from "@/hooks/queries"
import {
  BUSINESS_DEPOSIT_KYB_COPY,
  US_PAY_IN_MODE_OPTIONS,
  findUsUsdBankCorridor,
  resolveBusinessDepositKyb,
  resolveBusinessLedgerPayInProvider,
  resolveUsPayInModeFromCorridor,
} from "@easner/shared"

function formatBalance(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function vaFieldRows(va: OfficeVirtualAccount): Array<[string, string]> {
  return (
    [
      ["Account number", va.accountNumber],
      ["Routing", va.routingNumber],
      ["IBAN", va.iban],
      ["BIC", va.bic],
      ["Sort code", va.sortCode],
      ["Bank", va.bankName],
      ["Holder", va.accountHolderName],
      ["Settlement", va.settlementTarget],
    ] as Array<[string, string | null]>
  ).filter((row): row is [string, string] => Boolean(row[1]?.trim()))
}

export function OfficeBankingPanel({
  kind,
  subjectId,
  banking,
  loading,
  error,
  onRetry,
  user,
  gridApproved,
  bridgeApproved,
  ownerUserId,
}: {
  kind: "user" | "business"
  subjectId: string
  banking: OfficeBankingPayload | undefined
  loading: boolean
  error?: string | null
  onRetry?: () => void
  user?: OfficeIdentityUser | null
  gridApproved?: boolean
  bridgeApproved?: boolean
  ownerUserId?: string | null
}) {
  const corridorsQuery = useOfficePayoutCorridors()

  const consumerRail = user ? consumerBankKycRail(user) : null
  const hasBridgeCustomer = Boolean(user?.bridge_customer_id)

  const currencies = useMemo(() => {
    const set = new Set<string>()
    for (const row of banking?.balances ?? []) if (row.currency) set.add(row.currency)
    for (const row of banking?.virtualAccounts ?? []) if (row.currency) set.add(row.currency)
    if (kind === "business") {
      set.add("USD")
      set.add("EUR")
    }
    return [...set].sort()
  }, [banking, kind])

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">{error}</p>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <OfficeSection
        title="Balances"
        action={
          <OfficePartnerSync
            kind={kind}
            subjectId={subjectId}
            user={user}
            ownerUserId={ownerUserId}
            virtualAccounts={banking?.virtualAccounts}
          />
        }
      >
        {(banking?.balances ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No ledger balances.</p>
        ) : (
          (banking?.balances ?? []).map((row) => (
            <OfficeDetailRow key={row.currency} label={row.currency}>
              {formatBalance(row.available, row.currency)}
            </OfficeDetailRow>
          ))
        )}
      </OfficeSection>

      {currencies.map((currency) => {
        const vas = (banking?.virtualAccounts ?? []).filter((va) => va.currency === currency)
        const livePayIn =
          kind === "business"
            ? resolveBusinessLedgerPayInProvider(corridorsQuery.data ?? [], currency)
            : currency === "GBP"
              ? "noah"
              : consumerRail
        const deposit =
          kind === "business"
            ? resolveBusinessDepositKyb({
                currency,
                officePayIn: livePayIn,
                gridApproved: Boolean(gridApproved),
                bridgeApproved: Boolean(bridgeApproved),
              })
            : {
                complete:
                  livePayIn === "bridge"
                    ? officeStatusIsApproved(user?.bridge_kyc_status)
                    : officeStatusIsApproved(user?.noah_kyc_status || user?.noahKycStatus),
                product: "us_banking" as const,
              }
        const copy = BUSINESS_DEPOSIT_KYB_COPY[deposit.product]
        const payInMode =
          kind === "business" && (currency === "USD" || currency === "EUR")
            ? resolveUsPayInModeFromCorridor(
                currency === "USD"
                  ? findUsUsdBankCorridor(corridorsQuery.data ?? [])
                  : (corridorsQuery.data ?? []).find(
                      (row) =>
                        String(row.currency_code ?? "").toUpperCase() === "EUR" &&
                        (row.rail == null || row.rail === "bank_transfer"),
                    ) ?? null,
              )
            : null
        const payInModeLabel =
          payInMode && payInMode !== "disabled"
            ? US_PAY_IN_MODE_OPTIONS.find((row) => row.value === payInMode)?.label
            : null
        return (
          <OfficeSection
            key={currency}
            title={`${currency} deposit`}
            description={!deposit.complete ? (kind === "business" ? copy.title : consumerRail === "noah"
              ? "NY / blocked geo customers stay on Noah until that rail is approved."
              : "Deposit locked until the live rail is approved.") : undefined}
            divide={false}
            action={
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge variant="outline">Pay-in · {officeProviderLabel(livePayIn)}</Badge>
                {payInModeLabel ? <Badge variant="outline">{payInModeLabel}</Badge> : null}
                <Badge variant={deposit.complete ? "emerald" : "amber"}>
                  {deposit.complete ? "Deposit open" : "Deposit locked"}
                </Badge>
              </div>
            }
          >
            {vas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No virtual account for {officeProviderLabel(livePayIn) || "this provider"}.
              </p>
            ) : (
              vas.map((va) => (
                <div key={va.id} className="rounded-2xl bg-muted/40 p-3">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{officeProviderLabel(va.provider)}</Badge>
                    {va.status ? <Badge variant="slate">{va.status}</Badge> : null}
                  </div>
                  {vaFieldRows(va).map(([label, value]) => (
                    <OfficeCopyValue key={label} label={label} value={value} />
                  ))}
                  <OfficeCopyValue label="Provider VA" value={va.providerVirtualAccountId} />
                  <OfficeCopyValue label="Provider customer" value={va.providerCustomerId} />
                </div>
              ))
            )}
          </OfficeSection>
        )
      })}

      {!hasBridgeCustomer && kind === "user" && consumerRail === "bridge" ? (
        <p className="text-xs text-muted-foreground">
          Bridge geo with no customer yet
          {user?.bridge_cutover_required_at ? " · cutover pending" : ""}.
        </p>
      ) : null}
    </div>
  )
}
