"use client"

import { useCallback, useMemo, useState, type ReactNode } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { PoweredByEasner } from "@/components/brand/powered-by-easner"
import { Check, Loader2 } from "lucide-react"
import { cn, formatCurrency } from "@/lib/utils"
import { easnerStripeElementsAppearance } from "@/lib/stripe/elements-appearance"
import { getStripeJs } from "@/lib/stripe/load-stripe-js"
import { paymentElementBillingFields } from "@/lib/stripe/payment-element-billing-fields"
import { onlinePaymentTabHint } from "@/lib/invoices/invoice-payment-copy"
import { COLLECTIONS_COPY } from "@/lib/copy/business-ui-copy"
import { analytics } from "@/lib/analytics"

type Props = {
  clientSecret: string
  amount: number
  currency: string
  /** Copy shown under "Payment received". */
  successMessage: string
  /** Shown above the pay button, e.g. the renewal disclosure on recurring links. */
  disclosure?: ReactNode
  /** Invoice already prints this above the tab; links and Checkout should show it here. */
  showMethodsHint?: boolean
  /**
   * Collect payer email on this page. Required for payment links (no bill-to).
   * Invoices already set `customer_email` on the session – leave this off.
   */
  collectEmail?: boolean
  /** Prefill / confirm with a known bill-to email (invoices). */
  knownEmail?: string | null
  /** Prefill name on card only – never hide the field or stamp it at confirm. */
  knownName?: string | null
  /** Payment-link page centers the methods hint; invoices stay left. */
  hintAlign?: "left" | "center"
  /**
   * Website embed preview only. Invoices and payment links already have a
   * page-level Powered by mark – leave this off to avoid a duplicate.
   */
  showPoweredBy?: boolean
  onPaid?: () => void
  onPaymentFailed?: (message: string) => void
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function payerEmailFromExpressEvent(
  event: StripeExpressCheckoutElementConfirmEvent,
): string {
  const details = event.billingDetails as { email?: string | null } | undefined
  return String(details?.email ?? "").trim()
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

export function PaymentFormSkeleton() {
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

export function PaymentReceivedNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">Payment received</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
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

function CheckoutSurface({
  amount,
  currency,
  successMessage,
  disclosure,
  showMethodsHint = true,
  collectEmail = false,
  knownEmail = null,
  hintAlign = "left",
  showPoweredBy = false,
  onPaid,
  onPaymentFailed,
}: Omit<Props, "clientSecret" | "knownName">) {
  const checkoutState = useCheckoutElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [hasWallets, setHasWallets] = useState(false)
  const [email, setEmail] = useState(() => String(knownEmail ?? "").trim())
  const narrow = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 480px)").matches,
    [],
  )

  const ready = checkoutState.type === "success"
  const resolvedEmail = email.trim()
  const emailReady = !collectEmail || isValidEmail(resolvedEmail)

  const confirmPayment = useCallback(async (overrideEmail?: string): Promise<
    { ok: true } | { ok: false; message: string }
  > => {
    if (checkoutState.type !== "success") {
      return { ok: false, message: "Payment form is not ready" }
    }
    const checkout = checkoutState.checkout as typeof checkoutState.checkout & {
      email?: string | null
      updateEmail?: (value: string) => Promise<unknown>
    }
    // Session created with customer_email / customer already has email – Stripe
    // rejects updateEmail and confirm({ email }) in that case (invoices).
    const sessionEmail = String(checkout.email ?? "").trim()
    const emailLocked =
      Boolean(sessionEmail) ||
      (!collectEmail && Boolean(String(knownEmail ?? "").trim()))
    const payerEmail = (
      overrideEmail ||
      resolvedEmail ||
      sessionEmail ||
      String(knownEmail ?? "")
    ).trim()
    if (!isValidEmail(payerEmail)) {
      const message = COLLECTIONS_COPY.payerEmailRequired
      setError(message)
      return { ok: false, message }
    }
    setSubmitting(true)
    setError(null)
    try {
      if (!emailLocked && typeof checkout.updateEmail === "function") {
        await checkout.updateEmail(payerEmail)
      }
      const result = await checkout.confirm({
        redirect: "if_required",
        ...(emailLocked ? {} : { email: payerEmail }),
      })
      if (result.type === "error") {
        const message = result.error.message || "Payment failed"
        setError(message)
        onPaymentFailed?.(message)
        return { ok: false, message }
      }
      setSuccess(true)
      onPaid?.()
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Payment failed"
      setError(message)
      onPaymentFailed?.(message)
      return { ok: false, message }
    } finally {
      setSubmitting(false)
    }
  }, [checkoutState, collectEmail, knownEmail, onPaid, onPaymentFailed, resolvedEmail])

  const handleExpressConfirm = useCallback(
    async (event: StripeExpressCheckoutElementConfirmEvent) => {
      const walletEmail = payerEmailFromExpressEvent(event)
      const result = await confirmPayment(resolvedEmail || walletEmail)
      if (!result.ok) {
        event.paymentFailed({ reason: "fail", message: result.message })
      }
    },
    [confirmPayment, resolvedEmail],
  )

  if (success) {
    return <PaymentReceivedNotice message={successMessage} />
  }

  if (checkoutState.type === "error") {
    return (
      <p className="text-sm text-destructive">
        {checkoutState.error.message || "Unable to load payment form"}
      </p>
    )
  }

  // Keep Elements mounted while loading (required for Stripe init). Show
  // skeleton until ready, then reveal methods + Pay CTA together – never put
  // "Loading payment methods…" on the button.
  return (
    <div className="space-y-4">
      {collectEmail ? (
        <div className="space-y-2">
          <Label htmlFor="easner-payer-email">{COLLECTIONS_COPY.payerEmailLabel}</Label>
          <Input
            id="easner-payer-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            name="email"
            className="rounded-full"
            placeholder={COLLECTIONS_COPY.payerEmailPlaceholder}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (error === COLLECTIONS_COPY.payerEmailRequired) setError(null)
            }}
            onBlur={() => {
              if (checkoutState.type !== "success" || !isValidEmail(resolvedEmail)) return
              const checkout = checkoutState.checkout as typeof checkoutState.checkout & {
                updateEmail?: (value: string) => Promise<unknown>
              }
              if (typeof checkout.updateEmail === "function") {
                void checkout.updateEmail(resolvedEmail)
              }
            }}
            aria-invalid={Boolean(error) && !emailReady}
          />
        </div>
      ) : null}
      {showMethodsHint ? (
        <p
          className={cn(
            "text-sm text-muted-foreground",
            hintAlign === "center" && "text-center",
          )}
        >
          {onlinePaymentTabHint()}
        </p>
      ) : null}
      <div className="relative">
      {!ready ? <PaymentFormSkeleton /> : null}
      <div
        className={
          ready ? "space-y-4" : "pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        }
        aria-hidden={!ready}
      >
        <ExpressCheckoutElement
          options={{
            layout: {
              maxColumns: narrow ? 1 : 2,
              overflow: "never",
            },
          }}
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
              // Omit defaultCollapsed – Checkout Elements' payment.update() rejects it.
              radios: narrow ? "never" : "always",
              spacedAccordionItems: true,
            },
            // Prefill name via CheckoutElementsProvider defaultValues – createPaymentElement
            // rejects options.defaultValues (classic Elements API only).
            fields: paymentElementBillingFields({ collectEmail, knownEmail }),
          }}
        />

        {ready ? (
          <>
            {disclosure ? (
              <div className="text-xs leading-relaxed text-muted-foreground">{disclosure}</div>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              className="w-full h-11 rounded-full text-base font-medium"
              disabled={submitting || (collectEmail && !emailReady)}
              onClick={() => void confirmPayment()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Processing…
                </>
              ) : (
                `Pay ${formatCurrency(amount, currency)}`
              )}
            </Button>
          </>
        ) : null}
      </div>
      </div>
      {showPoweredBy ? (
        <PoweredByEasner className="border-t border-border pt-4" campaign="payer_checkout" />
      ) : null}
    </div>
  )
}

/**
 * Card, bank, and wallet payment form for every Easner collection surface
 * (invoice Pay online, Payment Links, website embed preview).
 * Page-hosted invoices and links omit the under-methods Powered by mark.
 */
export function EasnerPaymentElementCheckout({
  clientSecret,
  knownName,
  knownEmail,
  ...surface
}: Props) {
  const elementsAppearance = useMemo(() => easnerStripeElementsAppearance(), [])
  const stripePromise = useMemo(() => getStripeJs(), [])
  const prefillName = String(knownName ?? "").trim()

  return (
    <CheckoutElementsProvider
      stripe={stripePromise}
      options={{
        clientSecret,
        elementsOptions: {
          appearance: elementsAppearance,
        },
        // Prefill name only. Do NOT pass defaultValues.email when the Session was
        // created with customer_email (invoices) – Stripe rejects email updates and
        // Payment Element fails to mount.
        ...(prefillName
          ? {
              defaultValues: {
                billingAddress: {
                  name: prefillName,
                } as { name: string } & { address: never },
              },
            }
          : {}),
      }}
    >
      <CheckoutSurface knownEmail={knownEmail} {...surface} />
    </CheckoutElementsProvider>
  )
}
