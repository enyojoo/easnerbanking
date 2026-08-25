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

/**
 * Admin rate catalogs – cron-synced server-side every ~5 minutes, so a 60s
 * client staleTime plus a 5-minute poll tracks the source of truth without
 * refetching on every mount/navigation. The poll pauses while the tab is
 * backgrounded (`refetchIntervalInBackground: false`); the react-query mount
 * default still refetches stale data when a rates page is revisited.
 */
export const officeRatesQueryDefaults = {
  staleTime: 60_000,
  gcTime: OFFICE_REFERENCE_GC_MS,
  placeholderData: keepPreviousData,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  refetchInterval: 5 * 60_000,
  refetchIntervalInBackground: false,
  meta: { webPersist: "none" as const, freshness: "reference" as const },
}
