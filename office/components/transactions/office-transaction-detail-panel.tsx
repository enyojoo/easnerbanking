"use client"

import Link from "next/link"
import {
  buildInboundReceiveDetailRows,
  buildTransactionEmailDetailRows,
  formatTransactionWhen,
  ledgerTransactionStatusDisplay,
  type BalanceMoveReviewSnapshot,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
  type InboundReceiveDetailSnapshot,
  type ReviewFlowKind,
  type YcFundBalanceDepositReviewSnapshot,
} from "@easner/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OfficeCopyValue } from "@/components/case/office-copy-value"
import { officeProviderLabel } from "@/lib/case/status"
import { formatOfficeTimestamp } from "@/lib/format-office-date"
import { officeTransactionLedgerHref } from "@/lib/office-transaction-path"
import type {
  OfficeCustomerTransactionDetail,
  OfficeRelatedLedgerLeg,
  OfficeTransactionDetail,
} from "@/lib/types/office-transaction"

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm text-right whitespace-pre-line ${bold ? "font-semibold" : "font-medium"}`}>
        {value}
      </span>
    </div>
  )
}

function statusBadgeVariant(status: string): "emerald" | "amber" | "oxblood" | "slate" | "outline" {
  const { tone } = ledgerTransactionStatusDisplay(status)
  switch (tone) {
    case "completed":
      return "emerald"
    case "pending":
      return "amber"
    case "processing":
      return "outline"
    case "failed":
      return "oxblood"
    case "cancelled":
      return "slate"
    default:
      return "outline"
  }
}

function stringifyPretty(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ""
  }
}

function isInboundSnapshot(value: unknown): value is InboundReceiveDetailSnapshot {
  return Boolean(value && typeof value === "object" && "kind" in (value as object))
}

function customerBreakdownRows(customer: OfficeCustomerTransactionDetail): Array<{ label: string; value: string }> {
  const inbound = isInboundSnapshot(customer.inboundReceive) ? customer.inboundReceive : null
  if (inbound && typeof inbound === "object") {
    return buildInboundReceiveDetailRows(inbound, { surface: "detail" }).map((row) => ({
      label: row.label,
      value: row.value,
    }))
  }

  const paymentMethod = customer.stripePaymentMethod
  const extra: Array<{ label: string; value: string }> = []
  if (paymentMethod) {
    const brand = [paymentMethod.brand, paymentMethod.last4 ? `•••• ${paymentMethod.last4}` : ""]
      .filter(Boolean)
      .join(" ")
    extra.push({
      label: "Payment method",
      value: brand || paymentMethod.type || customer.paymentScheme || "–",
    })
  } else if (customer.paymentScheme) {
    extra.push({ label: "Payment method", value: customer.paymentScheme })
  }
  if (customer.settlementRailLabel) extra.push({ label: "Settles to", value: customer.settlementRailLabel })
  if (customer.customerName) extra.push({ label: "Customer", value: customer.customerName })
  if (customer.customerEmail) extra.push({ label: "Email", value: customer.customerEmail })

  const emailRows = buildTransactionEmailDetailRows({
    direction: null,
    payoutReview: customer.payoutReview as GlobalPayoutReviewSnapshot | null | undefined,
    payoutReviewFlow: (customer.payoutReviewFlow as ReviewFlowKind | null) ?? undefined,
    depositReview: customer.depositReview as YcFundBalanceDepositReviewSnapshot | null | undefined,
    inboundReceive: inbound ?? null,
    moveReview: customer.moveReview as BalanceMoveReviewSnapshot | null | undefined,
    receiveNetwork: customer.receiveNetwork,
    recipient: customer.recipientSnapshot
      ? {
          fullName: String((customer.recipientSnapshot as GlobalPayoutRecipientSnapshot).full_name ?? ""),
        }
      : customer.counterpartyName
        ? { fullName: customer.counterpartyName }
        : null,
    deposit:
      customer.depositAmount != null || customer.postedAmount != null || customer.narration
        ? {
            scheme: customer.paymentScheme ?? null,
            senderDisplay: customer.counterpartyName ?? null,
            feeAmount: customer.fee ?? null,
            postedAmount: customer.postedAmount ?? null,
            postedCurrency: customer.postedCurrency ?? null,
            narration: customer.narration ?? null,
          }
        : null,
  })

  const note = String(customer.sendNote || "").trim()
  const merged = [...extra, ...emailRows]
  if (note && !merged.some((row) => row.value === note)) {
    merged.push({ label: "Note", value: note })
  }
  return merged
}

function RelatedLegsTable({ related }: { related: OfficeRelatedLedgerLeg[] }) {
  if (related.length === 0) {
    return <p className="text-sm text-muted-foreground">No related provider legs.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Feed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {related.map((leg) => (
          <TableRow key={leg.id}>
            <TableCell>
              <Link href={officeTransactionLedgerHref(leg.id)} className="font-medium text-primary hover:underline">
                {officeProviderLabel(leg.provider)}
              </Link>
              <div className="font-mono text-[11px] text-muted-foreground truncate max-w-[180px]">
                {leg.provider_transaction_id || leg.easner_transaction_id || leg.id}
              </div>
            </TableCell>
            <TableCell>{leg.productLabel || "–"}</TableCell>
            <TableCell className="tabular-nums">{leg.amountFormatted || "–"}</TableCell>
            <TableCell>
              <Badge variant={statusBadgeVariant(leg.status)}>
                {ledgerTransactionStatusDisplay(leg.status).label}
              </Badge>
            </TableCell>
            <TableCell>{leg.hiddenFromFeed ? "Hidden" : "Visible"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function OfficeTransactionDetailPanel({ detail }: { detail: OfficeTransactionDetail }) {
  const { transaction, customer, ops, account, related, metadata, payload } = detail
  const { label: statusLabel } = ledgerTransactionStatusDisplay(transaction.status)
  const whenAt = transaction.occurred_at || transaction.created_at
  const breakdown = customerBreakdownRows(customer)
  const metadataJson = stringifyPretty(metadata)
  const payloadJson = stringifyPretty(payload)
  const lifecycle = customer.lifecycle ?? []
  const timing = customer.transactionTiming ?? []
  const stripePm = customer.stripePaymentMethod
  const stripePmLabel = stripePm
    ? [stripePm.brand || stripePm.type, stripePm.last4 ? `•••• ${stripePm.last4}` : ""].filter(Boolean).join(" ")
    : ""

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {transaction.productLabel ? <Badge variant="outline">{transaction.productLabel}</Badge> : null}
          <Badge variant="secondary">{officeProviderLabel(transaction.provider)}</Badge>
          {transaction.payInRail ? <Badge variant="outline">{transaction.payInRail.replace(/_/g, " ")}</Badge> : null}
          {ops.hiddenFromFeed ? <Badge variant="slate">Hidden from feed</Badge> : null}
          <Badge variant={statusBadgeVariant(transaction.status)}>{statusLabel}</Badge>
        </div>
        <p className="text-lg font-semibold">
          {customer.displayHeroTitle || transaction.label || transaction.easner_transaction_id || transaction.id}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-gray-500">Display amount</p>
            <p className="font-medium tabular-nums">{transaction.amountFormatted || "–"}</p>
          </div>
          <div>
            <p className="text-gray-500">USD/EUR impact</p>
            <p className="font-medium tabular-nums">
              {transaction.impactFormatted || transaction.balanceFormatted || "–"}
            </p>
          </div>
          <div>
            <p className="text-gray-500">When</p>
            <p className="font-medium">{whenAt ? formatTransactionWhen(whenAt) : "–"}</p>
          </div>
        </div>
      </div>

      {breakdown.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Breakdown</h3>
            <div className="rounded-lg border border-gray-200 px-3">
              {breakdown.map((row) => (
                <DetailRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {lifecycle.length > 0 ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Status</h3>
            <ol className="space-y-2">
              {lifecycle.map((step) => (
                <li key={step.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{step.title}</p>
                    {step.description ? <p className="text-muted-foreground">{step.description}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{step.state}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {timing.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Timing</h3>
            <div className="rounded-lg border border-gray-200 px-3">
              {timing.map((row) => (
                <DetailRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6 space-y-1">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Provider / ops</h3>
          <OfficeCopyValue label="Easner ID" value={ops.easnerTransactionId} />
          <OfficeCopyValue label="Ledger ID" value={ops.ledgerId} />
          <OfficeCopyValue label="Provider" value={officeProviderLabel(ops.provider)} mono={false} />
          <OfficeCopyValue label="Provider Tx ID" value={ops.providerTransactionId} />
          <OfficeCopyValue label="Provider event" value={ops.providerEventId} />
          {ops.providerEventId ? (
            <div className="pb-2">
              <Button asChild variant="link" className="h-auto px-0 text-sm">
                <Link href="/platform-control?tab=webhooks">Open webhook inbox</Link>
              </Button>
            </div>
          ) : null}
          <OfficeCopyValue label="Raw status" value={ops.rawStatus} mono={false} />
          {ops.ycMode ? <OfficeCopyValue label="YC mode" value={ops.ycMode.replace(/_/g, " ")} mono={false} /> : null}
          {ops.payInRail ? (
            <OfficeCopyValue label="Pay-in rail" value={ops.payInRail.replace(/_/g, " ")} mono={false} />
          ) : null}
          <OfficeCopyValue label="Chain" value={ops.chain} />
          <OfficeCopyValue label="Asset" value={ops.asset} />
          <OfficeCopyValue label="Tx hash" value={ops.txHash} />
          <OfficeCopyValue label="Wallet" value={ops.walletAddress} />
          <OfficeCopyValue label="Counterparty" value={ops.counterpartyAddress || customer.counterpartyName} />
          {stripePmLabel ? <OfficeCopyValue label="Payment method" value={stripePmLabel} mono={false} /> : null}
          <OfficeCopyValue label="Failure" value={ops.failureReason} mono={false} />
          <OfficeCopyValue
            label="Created"
            value={ops.createdAt ? formatOfficeTimestamp(ops.createdAt) : null}
            mono={false}
          />
          <OfficeCopyValue
            label="Occurred"
            value={ops.occurredAt ? formatOfficeTimestamp(ops.occurredAt) : null}
            mono={false}
          />
          <OfficeCopyValue
            label="Settled"
            value={ops.settledAt ? formatOfficeTimestamp(ops.settledAt) : null}
            mono={false}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Account</h3>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">User</span>
              {account.userHref ? (
                <Link href={account.userHref} className="text-primary hover:underline">
                  {account.userName || account.userEmail || account.userId}
                </Link>
              ) : (
                <span>{account.userName || account.userEmail || "–"}</span>
              )}
            </div>
            {account.userEmail && account.userName ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Email</span>
                <span>{account.userEmail}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Business</span>
              {account.businessHref ? (
                <Link href={account.businessHref} className="text-primary hover:underline">
                  {account.businessName || account.businessId}
                </Link>
              ) : (
                <span>{account.businessName || "–"}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Related legs</h3>
          <RelatedLegsTable related={related} />
        </CardContent>
      </Card>

      <details className="rounded-xl border border-border/60 bg-card px-4">
        <summary className="cursor-pointer py-4 text-sm font-medium">Advanced</summary>
        <div className="space-y-4 pb-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Metadata</p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
              {metadataJson || "–"}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payload</p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">
              {payloadJson || "–"}
            </pre>
          </div>
        </div>
      </details>
    </div>
  )
}
