"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Landmark, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  formatMoneyDisplay,
  REVIEW_ROW_LABELS,
  ycPayInCompleteCta,
  YC_PAY_IN_SEND_EXACTLY_LABEL,
  ycPayInCompleteNotice,
  type YcPayInRail,
} from "@easner/shared"
import { ycBankInfoFields } from "@/lib/yc-bank-info-fields"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { YcLocalPayInCompleteSummary } from "@/components/yc-local-pay-in-complete-summary"
import { YcPayInAwaitingPaymentCountdown } from "@/components/yc/yc-pay-in-awaiting-payment-countdown"

export type YcCompleteDepositPanelProps = {
  flowMode: "fund_balance" | "cross_border_send"
  transactionId: string
  transferId: string
  localPayIn: number
  localCurrency: string
  creditOrReceiveAmount: number
  creditOrReceiveCurrency: string
  customerRate: number
  processingFeeLocal?: number
  provisionalPayIn?: number
  payInRail: YcPayInRail
  bankInfo?: Record<string, unknown> | null
  sourcePhone?: string
  sourceNetworkName?: string
  recipientName?: string
  payInNotice?: string
  copiedField?: string | null
  onCopy?: (text: string, field: string) => void
  /** Where transaction detail back should land after YC pay-in complete. */
  returnTo?: "dashboard" | "transactions"
  /** When true, hide the attest CTA (detail "here" link replay). */
  readOnly?: boolean
  /** Channel deposit window expiry (ISO) — awaiting payment countdown. */
  depositExpiresAt?: string | null
}

export function YcCompleteDepositPanel({
  flowMode,
  transactionId,
  transferId,
  localPayIn,
  localCurrency,
  creditOrReceiveAmount,
  creditOrReceiveCurrency,
  customerRate,
  processingFeeLocal = 0,
  provisionalPayIn,
  payInRail,
  bankInfo,
  sourcePhone,
  sourceNetworkName,
  recipientName,
  payInNotice,
  copiedField,
  onCopy,
  returnTo = "dashboard",
  readOnly = false,
  depositExpiresAt,
}: YcCompleteDepositPanelProps) {
  const router = useRouter()
  const [attestLoading, setAttestLoading] = useState(false)
  const [attestError, setAttestError] = useState<string | null>(null)

  const isFundBalance = flowMode === "fund_balance"
  const isMomo = payInRail === "mobile_money"
  const title = isFundBalance ? "Complete deposit" : "Complete payment"
  const payInAmount = formatMoneyDisplay(localPayIn, localCurrency)
  const completeNotice = ycPayInCompleteNotice(payInRail)
  const bankFields = ycBankInfoFields(bankInfo)
  const PaymentIcon = isMomo ? Smartphone : Landmark

  const handleAttest = async () => {
    if (attestLoading || !transactionId.trim() || !transferId.trim()) return
    setAttestError(null)
    setAttestLoading(true)
    try {
      const res = await fetch("/api/yellowcard/pay-in/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, transferId }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "Could not confirm payment")
      }
      router.replace(transactionWebDetailPath(transactionId, { returnTo }))
    } catch (e) {
      setAttestError(e instanceof Error ? e.message : "Could not confirm payment")
    } finally {
      setAttestLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {!readOnly ? <h2 className="text-2xl font-semibold">{title}</h2> : null}

      <div className="rounded-xl border border-border p-4 space-y-1 text-sm">
        <YcLocalPayInCompleteSummary
          flowMode={flowMode}
          transactionId={transactionId}
          localPayIn={localPayIn}
          localCurrency={localCurrency}
          creditOrReceiveAmount={creditOrReceiveAmount}
          creditOrReceiveCurrency={creditOrReceiveCurrency}
          customerRate={customerRate}
          provisionalPayIn={provisionalPayIn}
          processingFeeLocal={processingFeeLocal}
          payInRail={payInRail}
          recipientName={recipientName}
          copiedField={copiedField}
          onCopy={onCopy}
        />
      </div>

      {depositExpiresAt ? (
        <YcPayInAwaitingPaymentCountdown depositExpiresAt={depositExpiresAt} />
      ) : null}

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
            Payment details unavailable. Contact support with reference {transactionId}.
          </p>
        ) : (
          bankFields.map((f) => (
            <div key={f.id} className="flex justify-between items-center gap-4 py-3 border-b last:border-0">
              <span className="text-sm text-muted-foreground">{f.label}</span>
              {onCopy ? (
                <button
                  type="button"
                  onClick={() => void onCopy(f.value, `yc-complete-${f.id}`)}
                  className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
                >
                  <span className="break-all">{f.value}</span>
                  {copiedField === `yc-complete-${f.id}` ? (
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

      {attestError ? <p className="text-sm text-destructive text-center">{attestError}</p> : null}

      {!readOnly ? (
        <Button className="w-full" type="button" disabled={attestLoading} onClick={() => void handleAttest()}>
          {attestLoading ? "Confirming…" : ycPayInCompleteCta(payInRail)}
        </Button>
      ) : null}
    </div>
  )
}
