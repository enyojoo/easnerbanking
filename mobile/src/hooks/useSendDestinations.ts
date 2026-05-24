import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SendDestinationsResponse } from '@easner/shared'
import {
  getSendDestinationsCatalogRevision,
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
  const [revision, setRevision] = useState(() =>
    enabled ? getSendDestinationsCatalogRevision() : 0,
  )

  const syncFromMemory = useCallback(() => {
    const mem = getSendDestinationsMemory()
    if (mem) {
      setData(mem)
      setRevision(getSendDestinationsCatalogRevision())
    }
    return mem
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null)
      return
    }
    const body = await refreshSendDestinations()
    if (body) {
      setData(body)
      setRevision(getSendDestinationsCatalogRevision())
    } else {
      syncFromMemory()
    }
  }, [enabled, syncFromMemory])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      const hydrated = await hydrateSendDestinationsFromStorage()
      if (cancelled) return
      if (hydrated) {
        setData(hydrated)
        setRevision(getSendDestinationsCatalogRevision())
      }
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
    /** Bumps when catalog hydrates/refreshes (use with corridor arrays for form dropdowns). */
    catalogVersion: data?.catalog_version,
    catalogRevision: revision,
    refresh,
    enabled,
  }
}
