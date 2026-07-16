"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { SEND_FLOW_STATE_KEY, type SendFlowState } from "@/lib/send-flow-session"
import { YcCompleteDepositPanel } from "@/components/yc-complete-deposit-panel"
import { getCurrencySymbol } from "@/lib/utils"
import {
  formatMoneyDisplay,
  resolveYcCrossBorderLocalPayInBreakdown,
} from "@easner/shared"

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
  const payInRail = yc.payInRail ?? "bank_transfer"
  const payIn = yc.localPayIn
  const payInCurrency = state.sendCurrency
  const displayTransactionId = (
    yc.easnerTransactionId || yc.transactionId || state.transactionId
  ).toUpperCase()
  const payInBreakdown = resolveYcCrossBorderLocalPayInBreakdown({
    localPayIn: payIn,
    payInCurrency,
    receiveAmount: state.amount,
    customerRate: yc.customerRate,
    provisionalPayIn: yc.provisionalPayIn,
    displayProcessingFeeLocal: yc.displayProcessingFeeLocal,
  })
  const feeLocal = payInBreakdown.feeLocal
  const formattedPayIn = formatMoneyDisplay(payIn, payInCurrency)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/send/confirm")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="text-sm text-muted-foreground">
          Pay <span className="font-medium text-foreground">{formattedPayIn}</span> so{" "}
          {state.recipient.name} receives{" "}
          {getCurrencySymbol(state.receiveCurrency)}
          {state.amount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          {state.receiveCurrency}
        </p>
      </div>

      <YcCompleteDepositPanel
        flowMode="cross_border_send"
        transactionId={displayTransactionId}
        localPayIn={payIn}
        localCurrency={payInCurrency}
        creditOrReceiveAmount={state.amount}
        creditOrReceiveCurrency={state.receiveCurrency}
        customerRate={yc.customerRate}
        provisionalPayIn={yc.provisionalPayIn}
        processingFeeLocal={feeLocal}
        payInRail={payInRail}
        bankInfo={yc.bankInfo}
        sourcePhone={yc.sourcePhone}
        sourceNetworkName={yc.sourceNetworkName}
        recipientName={state.recipient.name}
        payInNotice={yc.payInNotice}
        copiedField={copiedKey}
        onCopy={handleCopy}
      />
    </div>
  )
}
