/** Reference admin catalogs – stable between tab visits. */
export const OFFICE_REFERENCE_STALE_MS = 5 * 60_000

/** Dashboard / overview aggregates. */
export const OFFICE_ANALYTICS_STALE_MS = 5 * 60_000

/** Operational lists (transactions, inbox). */
export const OFFICE_LIST_STALE_MS = 60_000

/** In-memory retention for operational queries (matches business). */
export const OFFICE_OPERATIONAL_GC_MS = 30 * 60_000

/** In-memory retention for reference admin catalogs. */
export const OFFICE_REFERENCE_GC_MS = 60 * 60_000

/** Default page size for office transaction lists. */
export const OFFICE_TRANSACTIONS_PAGE_SIZE = 50 as const
