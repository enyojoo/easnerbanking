import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SendDestinationsResponse } from '@easner/shared'
import {
  getSendDestinationsCatalogRevision,
  getSendDestinationsMemory,
  hydrateSendDestinationsFromStorage,
  refreshSendDestinations,
} from '../lib/sendDestinations'

/**
 * Keeps recipient-form catalog in sync with office fiat/crypto (Platform Control).
 * Data is prefetched at login and read from memory – no loading UI; lists render when ready.
 */
export function useSendDestinations() {
  const [data, setData] = useState<SendDestinationsResponse | null>(() => getSendDestinationsMemory())
  const [revision, setRevision] = useState(() => getSendDestinationsCatalogRevision())

  const syncFromMemory = useCallback(() => {
    const mem = getSendDestinationsMemory()
    if (mem) {
      setData(mem)
      setRevision(getSendDestinationsCatalogRevision())
    }
    return mem
  }, [])

  const refresh = useCallback(async () => {
    const body = await refreshSendDestinations()
    if (body) {
      setData(body)
      setRevision(getSendDestinationsCatalogRevision())
    } else {
      syncFromMemory()
    }
  }, [syncFromMemory])

  useEffect(() => {
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
  }, [refresh])

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
  }
}
