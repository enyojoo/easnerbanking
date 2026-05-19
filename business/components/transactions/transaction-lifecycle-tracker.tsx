"use client"

import { Check, Loader2, CircleX } from "lucide-react"
import { formatTransactionRowDateTime } from "@/lib/transaction-row-present"
import type { Transaction } from "@/lib/finance-types"

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
}

export function TransactionLifecycleTracker({ lifecycle, title = "Deposit status" }: Props) {
  if (!lifecycle.length) return null

  return (
    <div className="space-y-4 border-b border-border pb-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div className="space-y-0">
        {lifecycle.map((step, index) => {
          const active = step.state === "complete" || step.state === "current"
          const isLast = index === lifecycle.length - 1
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
                </p>
                {step.occurredAt ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatTransactionRowDateTime(step.occurredAt)}
                  </p>
                ) : null}
                <p className={`mt-1 text-sm ${active ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                  {step.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

