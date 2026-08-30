"use client"

import { EXPRESS_DEPOSITS_COPY } from "@easner/shared"
import { PaymentFormSkeleton } from "@/components/checkout/easner-payment-element-checkout"
import { Button } from "@/components/ui/button"
import { ExpressDepositsStripeSlot } from "@/components/compliance/express-deposits-stripe-slot"

type Props = {
  title: string
  hint: string
  element: HTMLElement | null
  /** True while auth / collect is in flight and the Stripe UI is not ready yet. */
  loading: boolean
  error: string | null
  onRetry?: () => void
}

export function ExpressDepositsPaymentCollectPanel({
  title,
  hint,
  element,
  loading,
  error,
  onRetry,
}: Props) {
  const ready = Boolean(element)
  const showSkeleton = !ready && !error && loading

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className="relative">
        {showSkeleton ? <PaymentFormSkeleton /> : null}
        <div
          className={
            ready
              ? undefined
              : "pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
          }
          aria-hidden={!ready}
        >
          <ExpressDepositsStripeSlot element={element} />
        </div>
      </div>
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          {onRetry && !loading ? (
            <Button type="button" variant="outline" className="w-full" onClick={onRetry}>
              {EXPRESS_DEPOSITS_COPY.tryAgainCta}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
