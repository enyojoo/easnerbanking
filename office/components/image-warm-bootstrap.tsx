"use client"

import { useEffect } from "react"
import { warmWebBankingImages } from "@easner/shared/image/warm-web-banking-images"

/** Prefetch flags, tokens, and chain logos so office tables and corridors paint complete. */
export function ImageWarmBootstrap() {
  useEffect(() => {
    // No /banks or /mobile-money public trees in office — skip payout icon URLs.
    warmWebBankingImages({ payoutIcons: false })
  }, [])

  return null
}
