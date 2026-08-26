"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import {
  EasnerPaymentElementCheckout,
  PaymentFormSkeleton,
  PaymentReceivedNotice,
} from "@/components/checkout/easner-payment-element-checkout"
import type { PublicInvoiceStripeCheckout } from "@/lib/invoices/json-public-invoice-from-row"
import type { Invoice } from "@/lib/b2b/types"
import { analytics } from "@/lib/analytics"

type Props = {
  invoice: Invoice
  easetag: string
  /** Preloaded with the public invoice payload – skips a second round trip. */
  initialCheckout?: PublicInvoiceStripeCheckout | null
  /** Merchant preview – do not collect payment. */
  previewOnly?: boolean
  /** Fired when Stripe confirms payment (parent can optimistically mark invoice paid). */
  onPaid?: () => void
}

export function InvoiceStripeCheckout({
  invoice,
  easetag,
  initialCheckout = null,
  previewOnly = false,
  onPaid,
}: Props) {
  const [paid, setPaid] = useState(false)

  const handlePaid = useCallback(() => {
    setPaid(true)
    onPaid?.()
  }, [onPaid])
  const [clientSecret, setClientSecret] = useState<string | null>(
    initialCheckout?.clientSecret ?? null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!previewOnly && !initialCheckout?.clientSecret)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (previewOnly || paid) return
    if (initialCheckout?.clientSecret && reloadKey === 0) {
      setClientSecret(initialCheckout.clientSecret)
      setLoading(false)
      setLoadError(null)
      analytics.trackPayerCheckoutStarted({ invoiceId: invoice.id, currency: invoice.currency })
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(
          `/api/invoices/public/${encodeURIComponent(easetag)}/${encodeURIComponent(invoice.invoiceNumber)}/checkout-session`,
          { method: "POST" },
        )
        const json = (await res.json()) as {
          clientSecret?: string
          error?: string
        }
        if (cancelled) return
        if (!res.ok || !json.clientSecret) {
          throw new Error(json.error || "Failed to start checkout")
        }
        setClientSecret(json.clientSecret)
        analytics.trackPayerCheckoutStarted({ invoiceId: invoice.id, currency: invoice.currency })
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to start checkout")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [
    previewOnly,
    paid,
    easetag,
    invoice.invoiceNumber,
    reloadKey,
    initialCheckout?.clientSecret,
  ])

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
      </div>
    )
  }

  if (paid) {
    return <PaymentReceivedNotice message="Thank you. This invoice is marked paid." />
  }

  if (loading && !clientSecret && !loadError) {
    return <PaymentFormSkeleton />
  }

  if (loadError || !clientSecret) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive" role="alert">
          {loadError || "Unable to load payment form"}
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setClientSecret(null)
            setReloadKey((k) => k + 1)
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <EasnerPaymentElementCheckout
      clientSecret={clientSecret}
      amount={invoice.total}
      currency={invoice.currency}
      successMessage={`A receipt will be emailed to ${invoice.customerEmail || "the bill-to address"} shortly.`}
      showMethodsHint={false}
      knownEmail={invoice.customerEmail || null}
      knownName={invoice.customerName || null}
      onPaid={handlePaid}
      onPaymentFailed={(message) =>
        analytics.trackPayerPaymentFailed({ invoiceId: invoice.id, currency: invoice.currency, error: message })
      }
    />
  )
}
