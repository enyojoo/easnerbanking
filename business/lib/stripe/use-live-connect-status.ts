"use client"

import { useEffect, useState } from "react"
import {
  CONNECT_STATUS_UPDATED_EVENT,
  readCachedConnectStatus,
  type CachedConnectStatus,
  type ConnectStatusPayload,
} from "@/lib/stripe/connect-status-cache"

/** Live Stripe Connect status for Verification, Invoices, and collections banners. */
export function useLiveConnectStatus(businessId: string | null | undefined): CachedConnectStatus | null {
  const [status, setStatus] = useState<CachedConnectStatus | null>(() =>
    readCachedConnectStatus(businessId),
  )

  useEffect(() => {
    setStatus(readCachedConnectStatus(businessId))
    const onLive = (event: Event) => {
      const detail = (event as CustomEvent<ConnectStatusPayload | undefined>).detail
      if (detail) {
        setStatus({ ...detail, cachedAt: Date.now() })
        return
      }
      setStatus(readCachedConnectStatus(businessId))
    }
    window.addEventListener(CONNECT_STATUS_UPDATED_EVENT, onLive)
    return () => window.removeEventListener(CONNECT_STATUS_UPDATED_EVENT, onLive)
  }, [businessId])

  return status
}
