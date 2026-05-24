import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SendDestinationsResponse } from '@easner/shared'
import {
  getSendDestinationsMemory,
  hydrateSendDestinationsFromStorage,
  refreshSendDestinations,
  useSendDestinationsCatalogMobile,
} from '../lib/sendDestinations'

/**
 * Keeps recipient-form catalog in sync with office fiat/crypto (Platform Control).
 * Data is prefetched at login and read from memory — no loading UI; lists render when ready.
 */
export function useSendDestinations() {
  const enabled = useSendDestinationsCatalogMobile()
  const [data, setData] = useState<SendDestinationsResponse | null>(() =>
    enabled ? getSendDestinationsMemory() : null,
  )

  const syncFromMemory = useCallback(() => {
    const mem = getSendDestinationsMemory()
    if (mem) setData(mem)
    return mem
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null)
      return
    }
    const body = await refreshSendDestinations()
    if (body) setData(body)
    else syncFromMemory()
  }, [enabled, syncFromMemory])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      const hydrated = await hydrateSendDestinationsFromStorage()
      if (cancelled) return
      if (hydrated) setData(hydrated)
      await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, refresh])

  const bankCorridors = useMemo(() => data?.fiat.bank_transfer ?? [], [data])
  const mobileCorridors = useMemo(() => data?.fiat.mobile_money ?? [], [data])
  const cryptoDestinations = useMemo(() => data?.crypto ?? [], [data])

  return {
    data,
    bankCorridors,
    mobileCorridors,
    cryptoDestinations,
    balanceCurrencies: data?.balance_currencies ?? [],
    /** Bump when catalog changes so recipient forms re-read corridor cache. */
    catalogVersion: data?.catalog_version,
    refresh,
    enabled,
  }
}
