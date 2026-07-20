"use client"

import { Check, Copy, Landmark, Smartphone } from "lucide-react"
import {
  REVIEW_ROW_LABELS,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  formatMoneyDisplay,
  ycPayInCompleteNotice,
  type YcPayInRail,
} from "@easner/shared"
import { ycBankInfoFields } from "@/lib/yc-bank-info-fields"

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

      <div className="rounded-xl border border-border p-4 space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <PaymentIcon className="h-5 w-5 text-primary" />
          <p className="font-medium">{isMomo ? "Mobile Money" : "Bank Account"}</p>
        </div>
        {isMomo ? (
          <>
            {sourceNetworkName ? (
              <div className="flex justify-between gap-4 py-3 border-b">
                <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.paymentNetwork}</span>
                <span className="font-mono text-sm">{sourceNetworkName}</span>
              </div>
            ) : null}
            {sourcePhone ? (
              <div className="flex justify-between gap-4 py-3">
                <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.mobileNumber}</span>
                <span className="font-mono text-sm">{sourcePhone}</span>
              </div>
            ) : null}
          </>
        ) : bankFields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Payment details unavailable. Contact support with reference {displayTransactionId}.
          </p>
        ) : (
          bankFields.map((f) => (
            <div key={f.id} className="flex justify-between items-center gap-4 py-3 border-b last:border-0">
              <span className="text-sm text-muted-foreground">{f.label}</span>
              {onCopy ? (
                <button
                  type="button"
                  onClick={() => void onCopy(f.value, `yc-review-${f.id}`)}
                  className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
                >
                  <span className="break-all">{f.value}</span>
                  {copiedField === `yc-review-${f.id}` ? (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              ) : (
                <span className="font-mono text-sm">{f.value}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
