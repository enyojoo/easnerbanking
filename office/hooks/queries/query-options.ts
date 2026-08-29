import {
  keepPreviousData,
} from "@tanstack/react-query"
import {
  OFFICE_ANALYTICS_STALE_MS,
  OFFICE_LIST_STALE_MS,
  OFFICE_OPERATIONAL_GC_MS,
  OFFICE_REFERENCE_GC_MS,
  OFFICE_REFERENCE_STALE_MS,
} from "./constants"

export const officeOperationalQueryDefaults = {
  staleTime: OFFICE_LIST_STALE_MS,
  gcTime: OFFICE_OPERATIONAL_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  // Persisted (business-app pattern): reloads paint from the on-device
  // cache instantly and freshen silently. Per-user key, cleared on sign-out.
  meta: { webPersist: "reduced" as const, freshness: "operational" as const },
}

export const officeAnalyticsQueryDefaults = {
  staleTime: OFFICE_ANALYTICS_STALE_MS,
  gcTime: OFFICE_OPERATIONAL_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  meta: { webPersist: "reduced" as const, freshness: "analytics" as const },
}

export const officeReferenceQueryDefaults = {
  staleTime: OFFICE_REFERENCE_STALE_MS,
  gcTime: OFFICE_REFERENCE_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  meta: { webPersist: "reduced" as const, freshness: "reference" as const },
}

/**
 * Admin rate catalogs – cron-synced server-side; office realtime invalidates
 * the cache on upsert. Polling is applied in the hooks only when the channel
 * is unhealthy.
 */
export const officeRatesQueryDefaults = {
  staleTime: 60_000,
  gcTime: OFFICE_REFERENCE_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  meta: { webPersist: "reduced" as const, freshness: "reference" as const },
}
