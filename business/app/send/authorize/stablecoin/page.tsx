"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getCurrencySymbol } from "@/lib/utils"
import type { StablecoinAccount } from "@/lib/finance-types"
import { getStablecoinPaymentInstructions } from "@/lib/payment-instructions"
import { generateTransactionId } from "@/lib/transaction-id"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { ArrowLeft, Copy, Check } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"

const SEND_FLOW_STATE_KEY = "send_flow_state"

interface SendFlowState {
  recipient: { name: string }
  amount: number
  receiveCurrency: string
  sendAmount: number
  sendCurrency: string
  paymentMethod?: string
  transactionId?: string
}

export default function StablecoinAuthorizePage() {
  const router = useRouter()
  const [state, setState] = useState<SendFlowState | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [stablecoinAccount, setStablecoinAccount] = useState<StablecoinAccount | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem(SEND_FLOW_STATE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SendFlowState
        if (parsed.paymentMethod !== "usdc" && parsed.paymentMethod !== "usdt") {
          router.replace("/send")
          return
        }
        setState(parsed)
      } catch {
        router.replace("/send")
      }
    } else {
      router.replace("/send")
    }
  }, [router])

  useEffect(() => {
    if (!state) return
    let cancelled = false
    ;(async () => {
      setLoadError(null)
      try {
        const res = await fetchWithSession("/api/noah/wallets", {
          headers: { "X-Easner-Noah-Scope": "business" },
        })
        const data = (await res.json().catch(() => ({}))) as {
          wallets?: Array<{ address?: string }>
          error?: string
        }
        if (!res.ok) {
          throw new Error(data.error || "Could not load wallet")
        }
        const addr = data.wallets?.[0]?.address?.trim()
        if (!addr) {
          throw new Error("No deposit address found")
        }
        const stablecoinType =
          state.paymentMethod === "usdc" ? "USDC" : state.paymentMethod === "usdt" ? "USDT" : "USDC"
        if (cancelled) return
        setStablecoinAccount({
          currency: "USD",
          stablecoin: stablecoinType,
          chain: "Solana",
          address: addr,
          memo: "",
        })
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Could not load wallet")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state])

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
    const transactionId = state?.transactionId ?? generateTransactionId()
    sessionStorage.removeItem(SEND_FLOW_STATE_KEY)
    router.push(`/transactions/${encodeURIComponent(transactionId)}`)
  }

  const stablecoinType =
    state?.paymentMethod === "usdc" ? "USDC" : state?.paymentMethod === "usdt" ? "USDT" : "USDC"

  if (!state || loadError || !stablecoinAccount) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {loadError ?
          <p className="text-sm text-destructive">{loadError}</p>
        : <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-32 bg-muted rounded" />
          </div>
        }
      </div>
    )
  }

  const instructions = getStablecoinPaymentInstructions(stablecoinType)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Pay with {stablecoinType}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scan the QR code or copy the address to send {stablecoinType}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center pb-4 border-b gap-2">
            <span className="text-sm text-muted-foreground">Transaction ID</span>
            <button
              type="button"
              onClick={() => handleCopy(state?.transactionId ?? generateTransactionId(), "transactionId")}
              className="flex items-center gap-2 font-mono text-sm font-medium hover:text-primary transition-colors"
            >
              {state?.transactionId ?? generateTransactionId()}
              {copiedKey === "transactionId" ?
                <Check className="h-4 w-4 text-primary shrink-0" />
              : <Copy className="h-4 w-4 shrink-0" />}
            </button>
          </div>
          <div className="flex justify-between items-center pb-4 border-b">
            <span className="text-sm text-muted-foreground">You send</span>
            <span className="font-semibold">
              {getCurrencySymbol(state.sendCurrency)}
              {state.sendAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
              {stablecoinType}
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

      <div className="flex flex-col items-center">
        <div className="p-4 bg-white rounded-xl border dark:bg-muted">
          <QRCodeSVG
            value={stablecoinAccount.address}
            size={200}
            level="M"
          />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Scan to send {stablecoinAccount.stablecoin}
        </p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-1">Network</p>
        <div className="p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {stablecoinAccount.chain === "Solana"
              ? "SOL"
              : stablecoinAccount.chain === "Ethereum"
                ? "ETH"
                : stablecoinAccount.chain}
          </span>
          <span className="text-sm text-muted-foreground"> • </span>
          <span className="text-sm text-muted-foreground">
            {stablecoinAccount.chain}
          </span>
        </div>
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-1">Address</p>
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg gap-2">
          <code className="text-sm font-mono break-all flex-1 min-w-0">
            {stablecoinAccount.address}
          </code>
          <button
            type="button"
            onClick={() => handleCopy(stablecoinAccount.address, "address")}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {copiedKey === "address" ?
              <Check className="h-4 w-4 text-primary" />
            : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-2">Payment Instructions</p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            {instructions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

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
          {paymentConfirmed ? "Processing..." : "I've sent the payment"}
        </Button>
      </div>
    </div>
  )
}
