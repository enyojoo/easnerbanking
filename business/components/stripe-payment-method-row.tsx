"use client"

import { PaymentMethodBrandIconWithFallback } from "@/components/payment-method-brand-icon"
import { formatPaymentMethodText } from "@/lib/stripe/payment-method-display"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"
import { cn } from "@/lib/utils"

/** SVG brand chip + formatted mask/label for Stripe invoice payments. */
export function StripePaymentMethodRow({
  pm,
  className,
  textClassName,
}: {
  pm: StripePaymentMethodDisplay | null | undefined
  className?: string
  textClassName?: string
}) {
  if (!pm?.type) return null
  const text = formatPaymentMethodText(pm)
  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      <PaymentMethodBrandIconWithFallback pm={pm} />
      <span className={cn("truncate text-sm font-medium", textClassName)}>{text}</span>
    </span>
  )
}
