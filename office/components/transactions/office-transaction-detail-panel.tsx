"use client"

import {
  buildCrossBorderSendDetailRows,
  buildInboundReceiveDetailRows,
  computeDisplayProcessingFee,
  computeFootedDisplayProcessingFee,
  displayPayoutReceiveAmount,
  formatReviewRowMoneyDisplay,
  isYcFundBalanceDepositMetadata,
  resolveInboundReceiveDetail,
  resolvePayoutReviewFlow,
  REVIEW_ROW_LABELS,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@easner/shared"
import { Badge } from "@/components/ui/badge"
import type { OfficeTransaction } from "@/lib/types/office-transaction"

type Props = {
  transaction: OfficeTransaction
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

export function OfficeTransactionDetailPanel({ transaction }: Props) {
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
      exchangeFee: Number(meta.yc_leg_fees_usd ?? meta.exchange_fee ?? 0),
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
    const preciseFee = computeDisplayProcessingFee({
      processingFee: Number(payoutReview.processing_fee ?? meta.processing_fee ?? 0),
      exchangeFee: Number(payoutReview.exchange_fee ?? meta.yc_leg_fees_usd ?? 0),
    })
    const fee = computeFootedDisplayProcessingFee({
      sendingAmount: Number(payoutReview.you_send_amount),
      totalDebited: Number(payoutReview.total_debited),
      fallbackFee: preciseFee,
    })
    if (payoutReview.send_currency && payoutReview.you_send_amount != null) {
      detailRows.push({
        label: REVIEW_ROW_LABELS.sent,
        value: formatReviewRowMoneyDisplay(
          REVIEW_ROW_LABELS.sent,
          Number(payoutReview.you_send_amount),
          String(payoutReview.send_currency),
        ),
      })
    }
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
          displayPayoutReceiveAmount(payoutReview),
          String(payoutReview.receive_currency),
        ),
      })
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
    </div>
  )
}
