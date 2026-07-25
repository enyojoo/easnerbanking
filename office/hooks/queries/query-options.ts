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
  // Office records can include KYC and financial operations data. Keep them
  // memory-only while still retaining them across client-side navigation.
  meta: { webPersist: "none" as const, freshness: "operational" as const },
}

export const officeAnalyticsQueryDefaults = {
  staleTime: OFFICE_ANALYTICS_STALE_MS,
  gcTime: OFFICE_OPERATIONAL_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  meta: { webPersist: "none" as const, freshness: "analytics" as const },
}

export const officeReferenceQueryDefaults = {
  staleTime: OFFICE_REFERENCE_STALE_MS,
  gcTime: OFFICE_REFERENCE_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  meta: { webPersist: "none" as const, freshness: "reference" as const },
}

/** Admin rate catalogs — cron-synced; always fetch fresh, never persist to disk. */
export const officeRatesQueryDefaults = {
  staleTime: 0,
  gcTime: OFFICE_REFERENCE_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchOnMount: true,
  refetchIntervalInBackground: false,
  meta: { webPersist: "none" as const, freshness: "reference" as const },
}
