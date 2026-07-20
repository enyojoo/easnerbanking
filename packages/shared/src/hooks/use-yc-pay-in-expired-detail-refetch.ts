"use client"

import { useEffect, useRef } from "react"
import { useQuoteCountdown } from "./use-quote-countdown"
import {
  YC_PAY_IN_AWAITING_STATUS,
  isYcPayInFlowMetadata,
  resolveYcPayInFeedStatus,
} from "../transactions/yc-pay-in-display"

type Input = {
  enabled: boolean
  metadata?: Record<string, unknown> | null
  ledgerStatus: string
  quoteExpiresAt?: string | null
  /** When set, skips metadata-based awaiting detection (mobile/business detail rows). */
  awaitingPayIn?: boolean
  onRefetch: () => void
}

/** Refetch transaction detail once when the YC deposit window closes while still awaiting payment. */
export function useYcPayInExpiredDetailRefetch(input: Input): void {
  const countdown = useQuoteCountdown(input.quoteExpiresAt)
  const firedRef = useRef(false)

  const awaitingYcPayIn =
    input.enabled &&
    (input.awaitingPayIn === true ||
      (input.metadata &&
        isYcPayInFlowMetadata(input.metadata) &&
        resolveYcPayInFeedStatus(input.metadata, input.ledgerStatus) === YC_PAY_IN_AWAITING_STATUS))

  useEffect(() => {
    if (!awaitingYcPayIn || firedRef.current || !countdown.expired) return
    firedRef.current = true
    input.onRefetch()
  }, [awaitingYcPayIn, countdown.expired, input.onRefetch])
}
