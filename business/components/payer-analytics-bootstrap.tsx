"use client"

import { useEffect } from "react"
import { analytics } from "@/lib/analytics"

/** Registers payer_web platform + host on pay.easner.com and invoice.easner.com. */
export function PayerAnalyticsBootstrap() {
  useEffect(() => {
    analytics.registerPayerWebContext()
  }, [])
  return null
}
