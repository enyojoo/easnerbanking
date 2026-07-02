"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getCurrencySymbol } from "@/lib/utils"
import { generateTransactionId } from "@/lib/transaction-id"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { ArrowLeft, Copy, Check, Landmark } from "lucide-react"
import {
  SEND_FLOW_STATE_KEY,
  type SendFlowState,
} from "@/lib/send-flow-session"
import { fetchManualPaymentMethod } from "@/lib/manual-send-api"
import { completeManualSendFromSession } from "@/lib/manual-send-complete"
import type { PublicPaymentMethodDetail } from "@/lib/manual-send-api"
import { ManualSendReceiptUpload } from "@/components/send/manual-send-receipt-upload"

function getBankDetails(sendCurrency: string) {
  const baseDetails = {
    accountName: "Easner Payments",
    accountNumber: "",
    routingNumber: undefined as string | undefined,
    iban: undefined as string | undefined,
    swiftBic: undefined as string | undefined,
    bankName: "",
  }

  switch (sendCurrency) {
    case "USD":
      return {
        ...baseDetails,
        accountNumber: "1234567890",
        routingNumber: "123456789",
        swiftBic: "BRIDGEUS33",
        bankName: "Bridge Bank",
      }
    case "EUR":
      return {
        ...baseDetails,
        accountNumber: "9876543210",
        iban: "GB82WEST12345698765432",
        swiftBic: "BRIDGEGB33",
        bankName: "Bridge Bank Europe",
      }
    case "KES":
      return {
        ...baseDetails,
        accountNumber: "KES123456789",
        bankName: "Kenya Commercial Bank",
      }
    case "GHS":
      return {
        ...baseDetails,
        accountNumber: "GHS987654321",
        bankName: "Ghana Commercial Bank",
      }
    case "RUB":
      return {
        ...baseDetails,
        accountNumber: "RUB456789123",
        bankName: "Sberbank",
      }
    case "NGN":
      return {
        ...baseDetails,
        accountNumber: "NGN789123456",
        bankName: "Access Bank",
      }
    default:
      return {
        ...baseDetails,
        accountNumber: "1234567890",
        bankName: "Bridge Bank",
      }
  }
}

export default function BankTransferPage() {
  const router = useRouter()
  const [state, setState] = useState<SendFlowState | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [pm, setPm] = useState<PublicPaymentMethodDetail | null>(null)
  const [receiptPath, setReceiptPath] = useState<string | null>(null)

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

  useEffect(() => {
    const id = state?.manualPaymentMethodId
    if (!id) return
    let cancelled = false
    void fetchManualPaymentMethod(id)
      .then((row) => {
        if (!cancelled) setPm(row)
      })
      .catch(() => {
        if (!cancelled) setPm(null)
      })
    return () => {
      cancelled = true
    }
  }, [state?.manualPaymentMethodId])

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // ignore
    }
  }

  const handleConfirmPayment = () => {
    setPaymentConfirmed(true)
    void (async () => {
      try {
        let transactionId = state?.transactionId ?? generateTransactionId()
        if (state?.manualPaymentMethodId && state.manualQuote) {
          const created = await completeManualSendFromSession(state, { receiptUrl: receiptPath })
          transactionId = created.transactionId
        }
        sessionStorage.removeItem(SEND_FLOW_STATE_KEY)
        router.push(transactionWebDetailPath(transactionId))
      } catch {
        setPaymentConfirmed(false)
      }
    })()
  }

  if (!state) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  const bankDetails = pm
    ? {
        accountName: pm.account_name || pm.name,
        accountNumber: pm.account_number || "",
        routingNumber: pm.routing_number || undefined,
        iban: pm.iban || undefined,
        swiftBic: pm.swift_bic || undefined,
        bankName: pm.bank_name || pm.name,
      }
    : getBankDetails(state.sendCurrency)
  const transactionId = state?.transactionId ?? generateTransactionId()

  const CopyableField = ({
    label,
    value,
    fieldKey,
  }: {
    label: string
    value: string
    fieldKey: string
  }) => (
    <div className="flex justify-between items-center gap-4 py-3 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => handleCopy(value, fieldKey)}
        className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors"
      >
        {value}
        {copiedKey === fieldKey ? (
          <Check className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <Copy className="h-4 w-4 shrink-0" />
        )}
      </button>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Bank Transfer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Use the details below to complete your bank transfer
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b gap-2">
            <span className="text-sm text-muted-foreground">Transaction ID</span>
            <button
              type="button"
              onClick={() => handleCopy(transactionId, "transactionId")}
              className="flex items-center gap-2 font-mono text-sm font-medium hover:text-primary transition-colors"
            >
              {transactionId}
              {copiedKey === "transactionId" ? (
                <Check className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" />
              )}
            </button>
          </div>
          <div className="flex justify-between items-center pb-4 border-b">
            <span className="text-sm text-muted-foreground">Sending</span>
            <span className="font-semibold">
              {getCurrencySymbol(state.sendCurrency)}
              {state.sendAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
              {state.sendCurrency}
            </span>
          </div>
          <div className="flex justify-between items-center pb-4 border-b">
            <span className="text-sm text-muted-foreground">Recipient gets</span>
            <span className="font-semibold">
              {getCurrencySymbol(state.receiveCurrency)}
              {state.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
              {state.receiveCurrency}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Recipient</span>
            <span className="font-medium">{state.recipient?.name ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">One-time Bank Account Details</h2>
          </div>
          <div className="space-y-0">
            <CopyableField label="Account Name" value={bankDetails.accountName} fieldKey="accountName" />
            <CopyableField label="Account Number" value={bankDetails.accountNumber} fieldKey="accountNumber" />
            {bankDetails.routingNumber && (
              <CopyableField label="Routing Number" value={bankDetails.routingNumber} fieldKey="routingNumber" />
            )}
            {bankDetails.iban && (
              <CopyableField label="IBAN" value={bankDetails.iban} fieldKey="iban" />
            )}
            {bankDetails.swiftBic && (
              <CopyableField label="SWIFT/BIC" value={bankDetails.swiftBic} fieldKey="swiftBic" />
            )}
            <CopyableField label="Bank Name" value={bankDetails.bankName} fieldKey="bankName" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2">Payment Instructions</p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Use the account details above to make a payment from your bank</li>
            <li>Click &quot;I&apos;ve made the payment&quot; below once complete</li>
          </ol>
        </CardContent>
      </Card>

      {state.manualPaymentMethodId && (
        <ManualSendReceiptUpload
          referenceCode={transactionId}
          onPathChange={setReceiptPath}
          disabled={paymentConfirmed}
        />
      )}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="h-11" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          size="lg"
          className="flex-1 h-11"
          onClick={handleConfirmPayment}
          disabled={paymentConfirmed}
        >
          {paymentConfirmed ? "Processing..." : "I've made the payment"}
        </Button>
      </div>
    </div>
  )
}
