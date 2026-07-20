"use client"

import { useState } from "react"
import {
  YC_PAY_IN_AWAITING_DESCRIPTION_LINK,
  YC_PAY_IN_AWAITING_DESCRIPTION_SUFFIX,
  formatYcPayInDepositTimeRemaining,
  type YcPayInPaymentDetails,
} from "@easner/shared"
import { Check, Loader2, CircleX } from "lucide-react"
import { formatTransactionRowDateTime } from "@/lib/transaction-row-present"
import type { Transaction } from "@/lib/finance-types"
import { YcPayInPaymentDetailsDialog } from "@/components/transactions/yc-pay-in-payment-details-dialog"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"

function StepIcon({ id, active }: { id: string; active: boolean }) {
  if (id === "failed") {
    return <CircleX className={`h-4 w-4 ${active ? "text-destructive" : "text-muted-foreground"}`} />
  }
  if (id === "completed") {
    return <Check className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
  }
  return <Loader2 className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
}

type Props = {
  lifecycle: NonNullable<Transaction["lifecycle"]>
  title?: string
  ycPayInPaymentDetails?: YcPayInPaymentDetails | null
  quoteExpiresAt?: string | null
}

export function TransactionLifecycleTracker({
  lifecycle,
  title = "Deposit status",
  ycPayInPaymentDetails,
  quoteExpiresAt,
}: Props) {
  const [paymentDetailsOpen, setPaymentDetailsOpen] = useState(false)
  const quoteCountdown = useQuoteCountdown(quoteExpiresAt)

  if (!lifecycle.length) return null

  return (
    <>
      <div className="space-y-4 border-b border-border pb-4">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="space-y-0">
          {lifecycle.map((step, index) => {
            const active = step.state === "complete" || step.state === "current"
            const isLast = index === lifecycle.length - 1
            const showDepositTimer =
              step.id === "awaiting_transfer" &&
              step.state === "current" &&
              Boolean(quoteExpiresAt) &&
              !quoteCountdown.expired
            return (
              <div key={step.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                      active ? "border-primary bg-primary/10" : "border-border bg-muted"
                    }`}
                  >
                    <StepIcon id={step.id} active={active} />
                  </div>
                  {!isLast ? (
                    <div
                      className={`mt-1 w-0.5 flex-1 min-h-[3rem] ${
                        step.state === "complete" ? "bg-primary/40" : "bg-border"
                      }`}
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 pb-6">
                  <p className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.title}
                    {showDepositTimer ? (
                      <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-500">
                        {" · "}
                        {formatYcPayInDepositTimeRemaining(quoteCountdown.remainingMs)}
                      </span>
                    ) : null}
                  </p>
                  {step.occurredAt ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatTransactionRowDateTime(step.occurredAt)}
                    </p>
                  ) : null}
                  <p className={`mt-1 text-sm ${active ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                    {step.showPaymentDetailsLink && ycPayInPaymentDetails ? (
                      <>
                        {step.description}
                        <button
                          type="button"
                          className="underline underline-offset-2 text-foreground hover:text-primary"
                          onClick={() => setPaymentDetailsOpen(true)}
                        >
                          {YC_PAY_IN_AWAITING_DESCRIPTION_LINK}
                        </button>
                        {YC_PAY_IN_AWAITING_DESCRIPTION_SUFFIX}
                      </>
                    ) : (
                      step.description
                    )}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {ycPayInPaymentDetails ? (
        <YcPayInPaymentDetailsDialog
          open={paymentDetailsOpen}
          onOpenChange={setPaymentDetailsOpen}
          details={ycPayInPaymentDetails}
        />
      ) : null}
    </>
  )
}
