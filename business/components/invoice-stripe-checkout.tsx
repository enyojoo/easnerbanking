"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  StripeExpressCheckoutElementAvailablePaymentMethodsChangeEvent,
  StripeExpressCheckoutElementConfirmEvent,
  AvailablePaymentMethods,
} from "@stripe/stripe-js"
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Check, Loader2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
  easnerStripeElementsAppearance,
} from "@/lib/stripe/elements-appearance"
import { getStripeJs } from "@/lib/stripe/load-stripe-js"
import type { PublicInvoiceStripeCheckout } from "@/lib/invoices/json-public-invoice-from-row"
import type { Invoice } from "@/lib/b2b/types"

type Props = {
  invoice: Invoice
  easetag: string
  /** Preloaded with the public invoice payload — skips a second round trip. */
  initialCheckout?: PublicInvoiceStripeCheckout | null
  /** Merchant preview — do not collect payment. */
  previewOnly?: boolean
}

function hasReadyExpressMethods(methods: AvailablePaymentMethods | undefined): boolean {
  if (!methods) return false
  return Object.values(methods).some(Boolean)
}

function hasChangedExpressMethods(
  methods: StripeExpressCheckoutElementAvailablePaymentMethodsChangeEvent["paymentMethods"],
): boolean {
  if (!methods) return false
  return Object.values(methods).some((m) => m?.available === true)
}

function PaymentFormSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading payment methods">
      <Skeleton className="h-11 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="space-y-2 pt-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  )
}

function OrPayWithDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase tracking-wide">
        <span className="bg-background px-3 text-muted-foreground">Or pay with</span>
      </div>
    </div>
  )
}

function PaymentSuccess({ invoice, compact }: { invoice: Invoice; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">Payment received</p>
          <p className="text-sm text-muted-foreground">
            {compact
              ? "Thank you. This invoice is marked paid."
              : `A receipt will be emailed to ${invoice.customerEmail || "the bill-to address"} shortly.`}
          </p>
        </div>
      </div>
    </div>
  )
}

function CheckoutSurface({
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
  const [hasWallets, setHasWallets] = useState(false)

  const ready = checkoutState.type === "success"

  const confirmPayment = useCallback(async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (checkoutState.type !== "success") {
      return { ok: false, message: "Payment form is not ready" }
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await checkoutState.checkout.confirm({ redirect: "if_required" })
      if (result.type === "error") {
        const message = result.error.message || "Payment failed"
        setError(message)
        return { ok: false, message }
      }
      setSuccess(true)
      onPaid()
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Payment failed"
      setError(message)
      return { ok: false, message }
    } finally {
      setSubmitting(false)
    }
  }, [checkoutState, onPaid])

  const handleExpressConfirm = useCallback(
    async (event: StripeExpressCheckoutElementConfirmEvent) => {
      const result = await confirmPayment()
      if (!result.ok) {
        event.paymentFailed({ reason: "fail", message: result.message })
      }
    },
    [confirmPayment],
  )

  if (success) {
    return <PaymentSuccess invoice={invoice} />
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
      <ExpressCheckoutElement
        onReady={(event) => {
          setHasWallets(hasReadyExpressMethods(event.availablePaymentMethods))
        }}
        onAvailablePaymentMethodsChange={(event) => {
          setHasWallets(hasChangedExpressMethods(event.paymentMethods))
        }}
        onConfirm={(event) => void handleExpressConfirm(event)}
      />

      {hasWallets ? <OrPayWithDivider /> : null}

      <PaymentElement
        options={{
          layout: {
            type: "accordion",
            defaultCollapsed: false,
            radios: "always",
            spacedAccordionItems: true,
          },
        }}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        className="w-full h-11 text-base font-medium"
        disabled={!ready || submitting}
        onClick={() => void confirmPayment()}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Processing…
          </>
        ) : (
          `Pay ${formatCurrency(invoice.total, invoice.currency)}`
        )}
      </Button>
    </div>
  )
}

export function InvoiceStripeCheckout({
  invoice,
  easetag,
  initialCheckout = null,
  previewOnly = false,
}: Props) {
  const [paid, setPaid] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(
    initialCheckout?.clientSecret ?? null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(
    !previewOnly && !initialCheckout?.clientSecret,
  )
  const [reloadKey, setReloadKey] = useState(0)

  const elementsAppearance = useMemo(() => easnerStripeElementsAppearance(), [])

  const stripePromise = useMemo(() => getStripeJs(), [])

  useEffect(() => {
    getStripeJs()
  }, [])

  useEffect(() => {
    if (previewOnly || paid) return

    if (initialCheckout?.clientSecret && reloadKey === 0) {
      setClientSecret(initialCheckout.clientSecret)
      setLoading(false)
      setLoadError(null)
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
    return <PaymentSuccess invoice={invoice} compact />
  }

  if (loading && !clientSecret && !loadError && !initialCheckout?.clientSecret) {
    return <PaymentFormSkeleton />
  }

  if (loadError || !clientSecret || !stripePromise) {
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
    <CheckoutElementsProvider
      key={clientSecret}
      stripe={stripePromise}
      options={{
        clientSecret,
        // Email is set server-side via customer_email on the Checkout Session.
        // Do not pass defaultValues.email here — Stripe rejects updating email twice.
        elementsOptions: {
          appearance: elementsAppearance,
        },
      }}
    >
      <CheckoutSurface invoice={invoice} onPaid={() => setPaid(true)} />
    </CheckoutElementsProvider>
  )
}
