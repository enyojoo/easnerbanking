"use client"

import { useEffect } from "react"
import { getStripeJs } from "@/lib/stripe/load-stripe-js"

/** Start Stripe.js on public pay/invoice/checkout so Elements is warm when the secret arrives. */
export function PreloadStripeJs() {
  useEffect(() => {
    void getStripeJs()
  }, [])
  return null
}
