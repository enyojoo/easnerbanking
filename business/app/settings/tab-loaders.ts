"use client"

/**
 * Settings tab chunk loaders, shared by the settings page (readiness-gated
 * tab switching) and the workspace idle warm (chunks are cached before the
 * user ever reaches /settings). The Instant Standard rule: code-splitting
 * must never be visible — a tab switch waits for its (usually already
 * cached) chunk instead of flashing empty content.
 */
export const SETTINGS_TAB_LOADERS = {
  personal: () => import("@/components/settings/settings-personal-tab"),
  business: () => import("@/components/settings/settings-business-tab"),
  verification: () => import("@/components/settings/settings-verification-tab"),
  payments: () => import("@/components/settings/settings-payments-tab"),
  team: () => import("@/components/settings/settings-team-tab"),
  recipients: () => import("@/components/settings/settings-recipients-tab"),
  customers: () => import("@/components/settings/settings-customers-tab"),
  communication: () => import("@/components/settings/settings-communication-tab"),
  invoice: () => import("@/components/settings/settings-invoicing-tab"),
} as const

export type SettingsTabValue = keyof typeof SETTINGS_TAB_LOADERS

const loadedTabs = new Set<SettingsTabValue>()

export function isSettingsTabLoaded(tab: SettingsTabValue): boolean {
  return loadedTabs.has(tab)
}

export function loadSettingsTab(tab: SettingsTabValue): Promise<void> {
  if (loadedTabs.has(tab)) return Promise.resolve()
  return SETTINGS_TAB_LOADERS[tab]()
    .then(() => {
      loadedTabs.add(tab)
    })
    .catch(() => {
      // Chunk fetch failed (offline/deploy skew): let the dynamic component's
      // own loader retry on render rather than blocking the switch forever.
    })
}

export function warmSettingsTabModules(): void {
  for (const tab of Object.keys(SETTINGS_TAB_LOADERS) as SettingsTabValue[]) {
    void loadSettingsTab(tab)
  }
}
