"use client"

import { PaymentMethodBrandIconWithFallback } from "@/components/payment-method-brand-icon"
import { formatPaymentMethodTextBesideIcon } from "@/lib/stripe/payment-method-display"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"
import { cn } from "@/lib/utils"

/** SVG brand chip + mask/label (brand name omitted when the chip already shows it). */
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
  const text = formatPaymentMethodTextBesideIcon(pm)
  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      <PaymentMethodBrandIconWithFallback pm={pm} />
      {text ? (
        <span className={cn("truncate text-sm font-medium", textClassName)}>{text}</span>
      ) : null}
    </span>
  )
}
