"use client"

import { useState } from "react"
import type { YcPayInPaymentDetails } from "@easner/shared"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { YcCompleteDepositPanel } from "@/components/yc-complete-deposit-panel"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  details: YcPayInPaymentDetails
}

export function YcPayInPaymentDetailsDialog({ open, onOpenChange, details }: Props) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      window.setTimeout(() => setCopiedField(null), 2000)
    } catch {
      /* ignore */
    }
  }

  const title = details.flowMode === "fund_balance" ? "Payment details" : "Payment details"
  const creditOrReceiveAmount =
    details.flowMode === "fund_balance"
      ? details.receiveAmount ?? 0
      : details.receiveAmount ?? 0
  const creditOrReceiveCurrency =
    details.flowMode === "fund_balance"
      ? details.receiveCurrency ?? "USD"
      : details.receiveCurrency ?? ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <YcCompleteDepositPanel
          flowMode={details.flowMode}
          transactionId={details.transactionId}
          transferId={details.transferId ?? ""}
          localPayIn={details.localPayIn}
          localCurrency={details.localCurrency}
          creditOrReceiveAmount={creditOrReceiveAmount}
          creditOrReceiveCurrency={creditOrReceiveCurrency}
          customerRate={details.customerRate ?? 0}
          processingFeeLocal={details.displayProcessingFeeLocal ?? 0}
          provisionalPayIn={details.provisionalPayIn}
          payInRail={details.payInRail}
          bankInfo={details.bankInfo}
          sourcePhone={details.sourcePhone}
          sourceNetworkName={details.sourceNetworkName}
          recipientName={details.recipientName}
          payInNotice={details.payInNotice}
          copiedField={copiedField}
          onCopy={handleCopy}
          readOnly
          depositExpiresAt={details.depositExpiresAt}
        />
      </DialogContent>
    </Dialog>
  )
}
