/**
 * Storage policy matrix.
 *
 * Codifies where each class of data is allowed to live. This is the single
 * document both web and mobile reference when deciding whether to persist
 * something. If a new data class isn't in this table, it stays in memory.
 *
 * `forbidden` entries are the tripwires: if any of these ever reaches the
 * listed storage medium, it is a security bug.
 */

export const STORAGE_POLICY = {
  web: {
    memoryOnly: [
      "queryCache",
      "ephemeralFilters",
      "fxQuote",
      "pinEntryBuffer",
    ],
    cookie: [
      "sb-session",
      "businessAppSession",
      "selectedEntity",
      "selectedOrg",
    ],
    localStorage: ["ui.theme", "ui.density", "ui.sidebarCollapsed"],
    sessionStorage: [] as string[],
    urlSearchParams: ["filters", "dateRange", "tabId"],
    forbidden: ["balance", "ledger", "rawToken", "pii", "pan", "cvv"],
  },
  mobile: {
    secureStore: [
      "sb-session",
      "refreshToken",
      "pin",
      "biometricKey",
    ],
    asyncStorage: [
      "qc.persisted",
      "selectedEntity",
      "ui.theme",
      "lastKnown.balanceMetadata",
    ],
    fileCache: ["flagAssets", "avatarAssets"],
    memoryOnly: ["queryCache.hot", "pinEntryBuffer", "fxQuote"],
    forbidden: ["rawPAN", "cvv", "plaintextToken"],
  },
} as const

export type StoragePolicy = typeof STORAGE_POLICY
