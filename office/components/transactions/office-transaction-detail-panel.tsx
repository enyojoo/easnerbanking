"use client"

import { useState } from "react"
import Link from "next/link"
import {
  buildCrossBorderSendDetailRows,
  buildInboundReceiveDetailRows,
  computeDisplayProcessingFee,
  formatReviewRowMoneyDisplay,
  isYcFundBalanceDepositMetadata,
  resolveInboundReceiveDetail,
  resolvePayoutReviewFlow,
  REVIEW_ROW_LABELS,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@easner/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { officeFetch } from "@/lib/api-client"
import type { OfficeTransaction } from "@/lib/types/office-transaction"

type Props = {
  transaction: OfficeTransaction
  onStatusUpdated?: () => void
}

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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function formatProviderLabel(provider: string | null | undefined): string {
  const raw = String(provider || "").trim()
  if (!raw) return "—"
  if (raw.toLowerCase() === "easner_internal") return "Easetag"
  if (raw.toLowerCase() === "yellowcard") return "Yellowcard"
  if (raw.toLowerCase() === "noah") return "Noah"
  return raw
}

function eventInboxHref(transaction: OfficeTransaction): string {
  const meta = transaction.metadata || {}
  const sequenceId = String(meta.leg1_sequence_id ?? meta.sequence_id ?? transaction.provider_transaction_id ?? "").trim()
  const params = new URLSearchParams({ provider: "yellowcard" })
  if (sequenceId) params.set("q", sequenceId)
  return `/platform-control?tab=webhooks&${params.toString()}`
}

export function OfficeTransactionDetailPanel({ transaction, onStatusUpdated }: Props) {
  const [statusDraft, setStatusDraft] = useState(transaction.status)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const meta = transaction.metadata || {}
  const payoutReviewFlow = resolvePayoutReviewFlow(meta)
  const payoutReview = readRecord(meta.payout_review) as GlobalPayoutReviewSnapshot | null
  const recipientSnapshot = readRecord(meta.recipient_snapshot) as GlobalPayoutRecipientSnapshot | null
  const depositReview = readRecord(meta.deposit_review)
  const whenAt = transaction.occurred_at || transaction.created_at

  const detailRows: Array<{ label: string; value: string; bold?: boolean }> = []

  if (payoutReviewFlow === "local_pay_in" && payoutReview) {
    const displayProcessingFee = computeDisplayProcessingFee({
      processingFee: Number(meta.processing_fee ?? payoutReview.processing_fee ?? 0),
      ycLegFeesUsd: Number(meta.yc_leg_fees_usd ?? meta.exchange_fee ?? 0),
    })
    for (const row of buildCrossBorderSendDetailRows({
      payoutReview,
      recipientSnapshot,
      whenLabel: whenAt,
      displayProcessingFee,
    })) {
      detailRows.push({ label: row.label, value: row.value, bold: row.valueBold })
    }
  } else if (
    (depositReview || isYcFundBalanceDepositMetadata(meta)) &&
    transaction.direction === "in"
  ) {
    const resolved = resolveInboundReceiveDetail({
      metadata: meta,
      transactionId: transaction.easner_transaction_id || transaction.id,
      whenAt,
      amount: transaction.amount,
      currency: transaction.currency,
      direction: transaction.direction,
      provider: transaction.provider,
    })
    if (resolved) {
      for (const row of buildInboundReceiveDetailRows(resolved, "detail")) {
        detailRows.push({ label: row.label, value: row.value })
      }
    }
  } else if (payoutReview && payoutReviewFlow === "balance_payout") {
    if (payoutReview.send_currency && payoutReview.total_debited != null) {
      detailRows.push({
        label: REVIEW_ROW_LABELS.totalDebited,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.totalDebited,
          Number(payoutReview.total_debited),
          String(payoutReview.send_currency),
        ),
        bold: true,
      })
    }
    if (payoutReview.receive_currency && payoutReview.receive_amount != null) {
      detailRows.push({
        label: REVIEW_ROW_LABELS.recipientGets,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.recipientGets,
          Number(payoutReview.receive_amount),
          String(payoutReview.receive_currency),
        ),
      })
    }
    const fee = computeDisplayProcessingFee({
      processingFee: Number(payoutReview.processing_fee ?? meta.processing_fee ?? 0),
      ycLegFeesUsd: Number(meta.yc_leg_fees_usd ?? 0),
    })
    if (fee > 0 && payoutReview.send_currency) {
      detailRows.push({
        label: REVIEW_ROW_LABELS.processingFee,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.processingFee,
          fee,
          String(payoutReview.send_currency),
        ),
      })
    }
  }

  const opsFields: Array<{ label: string; value: string }> = [
    { label: "YC mode", value: String(meta.yc_mode ?? "—") },
    { label: "Pay-in rail", value: String(meta.pay_in_rail ?? "—") },
    { label: "Sequence ID", value: String(meta.leg1_sequence_id ?? meta.sequence_id ?? "—") },
    { label: "Reporting USD", value: String(meta.reporting_usd_amount ?? "—") },
    { label: "Failure leg", value: String(meta.failure_leg ?? "—") },
    { label: "Quote expires", value: String(meta.expires_at ?? meta.quote_expires_at ?? "—") },
  ]

  const onSaveStatus = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await officeFetch("/api/admin/office/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.id, status: statusDraft }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok || body.error) {
        throw new Error(body.error || "Status update failed")
      }
      onStatusUpdated?.()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Status update failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {transaction.productLabel ? <Badge variant="outline">{transaction.productLabel}</Badge> : null}
          <Badge variant="secondary">{formatProviderLabel(transaction.provider)}</Badge>
          {transaction.payInRail ? <Badge variant="outline">{transaction.payInRail}</Badge> : null}
        </div>
        {transaction.label ? <p className="text-lg font-semibold">{transaction.label}</p> : null}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500">Display amount</p>
            <p className="font-medium tabular-nums">{transaction.amountFormatted || "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">USD/EUR impact</p>
            <p className="font-medium tabular-nums">{transaction.impactFormatted || transaction.balanceFormatted || "—"}</p>
          </div>
        </div>
      </div>

      {detailRows.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Breakdown</h3>
          <div className="rounded-lg border border-gray-200 px-3">
            {detailRows.map((row) => (
              <DetailRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} bold={row.bold} />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Ops metadata</h3>
        <div className="rounded-lg border border-gray-200 px-3">
          {opsFields.map((field) => (
            <DetailRow key={field.label} label={field.label} value={field.value} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500">Easner ID</p>
          <p className="font-mono text-xs break-all">{transaction.easner_transaction_id || "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Provider Tx ID</p>
          <p className="font-mono text-xs break-all">{transaction.provider_transaction_id || "—"}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={eventInboxHref(transaction)}>Open webhook inbox</Link>
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Manual status override</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusDraft} onValueChange={setStatusDraft}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">pending</SelectItem>
              <SelectItem value="processing">processing</SelectItem>
              <SelectItem value="completed">completed</SelectItem>
              <SelectItem value="failed">failed</SelectItem>
              <SelectItem value="cancelled">cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => void onSaveStatus()} disabled={saving}>
            {saving ? "Saving..." : "Update status"}
          </Button>
        </div>
        {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
      </div>
    </div>
  )
}
