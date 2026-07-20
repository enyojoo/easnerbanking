"use client"

import { Check, Copy, Landmark, Smartphone } from "lucide-react"
import {
  REVIEW_ROW_LABELS,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  YC_PAY_IN_BANK_ACCOUNT_TITLE,
  YC_PAY_IN_BANK_ACCOUNT_SUBTITLE,
  formatMoneyDisplay,
  ycPayInCompleteNotice,
  type YcPayInRail,
} from "@easner/shared"
import { ycBankInfoFields } from "@/lib/yc-bank-info-fields"
import { TransactionDetailSummaryRow } from "@/components/transactions/transaction-detail-summary-row"

type Props = {
  payInRail: YcPayInRail
  localPayIn: number
  localCurrency: string
  bankInfo?: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkName?: string
  transactionId?: string
  copiedField?: string | null
  onCopy?: (text: string, field: string) => void
}

/** Bank/MoMo payment instructions for YC pay-in review (embedded on review screen). */
export function YcPayInPaymentInstructions({
  payInRail,
  localPayIn,
  localCurrency,
  bankInfo,
  sourcePhone,
  sourceNetworkName,
  transactionId,
  copiedField,
  onCopy,
}: Props) {
  const isMomo = payInRail === "mobile_money"
  const payInAmount = formatMoneyDisplay(localPayIn, localCurrency)
  const completeNotice = ycPayInCompleteNotice(payInRail)
  const bankFields = ycBankInfoFields(bankInfo)
  const PaymentIcon = isMomo ? Smartphone : Landmark
  const displayTransactionId = transactionId?.toUpperCase() ?? ""

  const momoRows = [
    sourceNetworkName
      ? { id: "network", label: REVIEW_ROW_LABELS.paymentNetwork, value: sourceNetworkName }
      : null,
    sourcePhone ? { id: "phone", label: REVIEW_ROW_LABELS.mobileNumber, value: sourcePhone } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; value: string }>

  const detailRows = isMomo ? momoRows : bankFields.map((f) => ({ id: f.id, label: f.label, value: f.value }))

  return (
    <div className="space-y-4">
      {(completeNotice || !isMomo) ? (
        <div className="space-y-4">
          {completeNotice ? (
            <p className="text-sm text-center text-muted-foreground px-2">{completeNotice}</p>
          ) : null}
          {!isMomo ? (
            <p className="text-sm text-center text-foreground">
              {YC_PAY_IN_SEND_EXACTLY_LABEL}{" "}
              <span className="text-xl font-semibold">{payInAmount}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl bg-card p-4 space-y-1">
        <div className="flex items-start gap-2 mb-3">
          <PaymentIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{isMomo ? "Mobile Money" : YC_PAY_IN_BANK_ACCOUNT_TITLE}</p>
            {!isMomo ? (
              <p className="text-sm text-muted-foreground">{YC_PAY_IN_BANK_ACCOUNT_SUBTITLE}</p>
            ) : null}
          </div>
        </div>
        {!isMomo && detailRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Payment details unavailable. Contact support with reference {displayTransactionId}.
          </p>
        ) : (
          detailRows.map((row) =>
            !isMomo && onCopy ? (
              <div
                key={row.id}
                className="flex justify-between items-center gap-4 border-b border-border py-2 text-sm last:border-0"
              >
                <span className="shrink-0 text-muted-foreground">{row.label}</span>
                <button
                  type="button"
                  onClick={() => void onCopy(row.value, `yc-review-${row.id}`)}
                  className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
                >
                  <span className="break-all">{row.value}</span>
                  {copiedField === `yc-review-${row.id}` ? (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              </div>
            ) : (
              <TransactionDetailSummaryRow
                key={row.id}
                label={row.label}
                value={row.value}
                valueClassName="font-mono"
              />
            ),
          )
        )}
      </div>
    </div>
  )
}
