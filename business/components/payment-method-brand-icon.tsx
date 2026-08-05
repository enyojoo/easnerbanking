"use client"

import { CreditCard } from "lucide-react"
import {
  paymentBrandSvgSrc,
  paymentMethodIconKey,
  type PaymentBrandIconKey,
} from "@/lib/stripe/payment-method-display"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"
import { cn } from "@/lib/utils"

export function PaymentMethodBrandIcon({
  pm,
  iconKey,
  className,
  alt,
}: {
  pm?: StripePaymentMethodDisplay | null
  iconKey?: PaymentBrandIconKey
  className?: string
  alt?: string
}) {
  const key = iconKey ?? paymentMethodIconKey(pm)
  const src = paymentBrandSvgSrc(key)
  return (
    // eslint-disable-next-line @next/next/no-img-element -- first-party static brand chip
    <img
      src={src}
      alt={alt ?? key}
      width={48}
      height={32}
      className={cn("inline-block h-5 w-auto shrink-0 rounded-[3px]", className)}
      onError={(e) => {
        const el = e.currentTarget
        el.style.display = "none"
        const sibling = el.nextElementSibling
        if (sibling instanceof HTMLElement) sibling.style.display = "inline-flex"
      }}
    />
  )
}

export function PaymentMethodBrandIconWithFallback({
  pm,
  className,
}: {
  pm?: StripePaymentMethodDisplay | null
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <PaymentMethodBrandIcon pm={pm} />
      <span className="hidden items-center text-muted-foreground" aria-hidden>
        <CreditCard className="h-4 w-4" />
      </span>
    </span>
  )
}
