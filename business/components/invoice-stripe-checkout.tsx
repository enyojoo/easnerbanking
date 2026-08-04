"use client"

import { useCallback, useMemo, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import type { Invoice } from "@/lib/b2b/types"

type Props = {
  invoice: Invoice
  easetag: string
  businessDisplayName?: string
  /** Merchant preview — do not collect payment. */
  previewOnly?: boolean
}

function CheckoutForm({
  invoice,
  onPaid,
}: {
  invoice: Invoice
  onPaid: () => void
}) {
  const checkoutState = useCheckoutElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handlePay = useCallback(async () => {
    if (checkoutState.type !== "success") return
    setSubmitting(true)
    setError(null)
    try {
      const result = await checkoutState.checkout.confirm({ redirect: "if_required" })
      if (result.type === "error") {
        setError(result.error.message || "Payment failed")
        return
      }
      setSuccess(true)
      onPaid()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed")
    } finally {
      setSubmitting(false)
    }
  }, [checkoutState, onPaid])

  if (success) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-foreground">Payment received</p>
        <p className="mt-1 text-muted-foreground">
          A receipt will be emailed to {invoice.customerEmail || "the bill-to address"} shortly.
        </p>
      </div>
    )
  }

  if (checkoutState.type === "loading") {
    return <p className="text-sm text-muted-foreground">Loading secure payment form…</p>
  }

  if (checkoutState.type === "error") {
    return (
      <p className="text-sm text-destructive">
        {checkoutState.error.message || "Unable to load payment form"}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" className="w-full" disabled={submitting} onClick={() => void handlePay()}>
        {submitting
          ? "Processing…"
          : `Pay ${formatCurrency(invoice.total, invoice.currency)}`}
      </Button>
    </div>
  )
}

export function InvoiceStripeCheckout({
  invoice,
  easetag,
  businessDisplayName,
  previewOnly = false,
}: Props) {
  const [paid, setPaid] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const stripePromise = useMemo(() => {
    if (!publishableKey) return null
    return loadStripe(publishableKey)
  }, [publishableKey])

  const startCheckout = useCallback(async () => {
    if (previewOnly) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/invoices/public/${encodeURIComponent(easetag)}/${encodeURIComponent(invoice.invoiceNumber)}/checkout-session`,
        { method: "POST" },
      )
      const json = (await res.json()) as {
        clientSecret?: string
        publishableKey?: string
        error?: string
      }
      if (!res.ok || !json.clientSecret || !json.publishableKey) {
        throw new Error(json.error || "Failed to start checkout")
      }
      setClientSecret(json.clientSecret)
      setPublishableKey(json.publishableKey)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to start checkout")
    } finally {
      setLoading(false)
    }
  }, [easetag, invoice.invoiceNumber, previewOnly])

  if (previewOnly) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Pay online</p>
        <p>
          Customers can pay {formatCurrency(invoice.total, invoice.currency)} with card, bank debit,
          and other methods available in their region.
        </p>
        <Button type="button" className="w-full" disabled>
          Pay {formatCurrency(invoice.total, invoice.currency)}
        </Button>
        {businessDisplayName ? (
          <p className="text-center text-xs">Powered by {businessDisplayName}</p>
        ) : null}
      </div>
    )
  }

  if (paid) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-foreground">Payment received</p>
        <p className="mt-1 text-muted-foreground">Thank you. This invoice is marked paid.</p>
      </div>
    )
  }

  if (!clientSecret || !stripePromise) {
    return (
      <div className="space-y-3">
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        <Button type="button" className="w-full" disabled={loading} onClick={() => void startCheckout()}>
          {loading ? "Preparing…" : `Pay ${formatCurrency(invoice.total, invoice.currency)}`}
        </Button>
        {businessDisplayName ? (
          <p className="text-center text-xs text-muted-foreground">Powered by {businessDisplayName}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <CheckoutElementsProvider
        stripe={stripePromise}
        options={{ clientSecret, elementsOptions: {} }}
      >
        <CheckoutForm invoice={invoice} onPaid={() => setPaid(true)} />
      </CheckoutElementsProvider>
      {businessDisplayName ? (
        <p className="text-center text-xs text-muted-foreground">Powered by {businessDisplayName}</p>
      ) : null}
    </div>
  )
}
