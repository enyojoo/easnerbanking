"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getCurrencySymbol } from "@/lib/utils"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { ArrowLeft, Copy, Check, Landmark } from "lucide-react"
import {
  SEND_FLOW_STATE_KEY,
  type SendFlowState,
} from "@/lib/send-flow-session"
import { ycBankInfoFields } from "@/lib/yc-bank-info-fields"

export default function YcPayInPage() {
  const router = useRouter()
  const [state, setState] = useState<SendFlowState | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(SEND_FLOW_STATE_KEY)
    if (raw) {
      try {
        setState(JSON.parse(raw) as SendFlowState)
      } catch {
        router.replace("/send")
      }
    } else {
      router.replace("/send")
    }
  }, [router])

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // ignore
    }
  }

  if (!state?.ycCrossBorder) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  const yc = state.ycCrossBorder
  const fields = ycBankInfoFields(yc.bankInfo)
  const payIn = yc.localPayIn
  const notice =
    yc.payInNotice ||
    `Complete your transfer to send this payment.`

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/send")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-2xl font-semibold text-foreground">Complete payment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pay{" "}
          <span className="font-medium text-foreground">
            {getCurrencySymbol(state.sendCurrency)}
            {payIn.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            {state.sendCurrency}
          </span>{" "}
          so{" "}
          {state.recipient.name} receives{" "}
          {getCurrencySymbol(state.receiveCurrency)}
          {state.amount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {state.receiveCurrency}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
        {notice}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <Landmark className="h-5 w-5 text-primary" />
          <p className="font-medium">Payment details</p>
        </div>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Payment details unavailable. Contact support with reference{" "}
            {yc.transactionId || yc.transferId}.
          </p>
        ) : (
          fields.map((f) => (
            <div
              key={f.id}
              className="flex justify-between items-center gap-4 py-3 border-b last:border-0"
            >
              <span className="text-sm text-muted-foreground">{f.label}</span>
              <button
                type="button"
                onClick={() => void handleCopy(f.value, f.id)}
                className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
              >
                <span className="break-all">{f.value}</span>
                {copiedKey === f.id ? (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Copy className="h-4 w-4 shrink-0" />
                )}
              </button>
            </div>
          ))
        )}
      </div>

      <Button
        className="w-full"
        onClick={() => {
          const txId = yc.transactionId || state.transactionId
          sessionStorage.removeItem(SEND_FLOW_STATE_KEY)
          router.push(transactionWebDetailPath(txId))
        }}
      >
        I&apos;ve made the payment
      </Button>
    </div>
  )
}
