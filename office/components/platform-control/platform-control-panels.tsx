"use client"

import { SettingsAdminPanel, type SettingsAdminSection } from "@/components/settings/settings-admin-panel"
import { OfficeRatesPanel } from "@/components/settings/office-rates-panel"
import { PayoutCorridorsAdminPanel } from "@/components/platform-control/payout-corridors-admin-panel"
import { CryptoDestinationsAdminPanel } from "@/components/platform-control/crypto-destinations-admin-panel"
import { OfficeNoahRatesPanel } from "@/components/settings/office-noah-rates-panel"
import { OfficeYcRatesPanel } from "@/components/settings/office-yc-rates-panel"
import { OfficeCryptoRatesPanel } from "@/components/settings/office-crypto-rates-panel"
import { EventInboxPanel } from "@/components/platform-control/event-inbox-panel"

export function PlatformConfigPanel() {
  return <SettingsAdminPanel section="platform" />
}

export function RatesPanel() {
  return <OfficeRatesPanel />
}

export function FiatPanel() {
  return <PayoutCorridorsAdminPanel />
}

export function CryptoPanel() {
  return <CryptoDestinationsAdminPanel />
}

export function NoahRatesPanel() {
  return <OfficeNoahRatesPanel />
}

export function YcRatesPanel() {
  return <OfficeYcRatesPanel />
}

export function CryptoRatesPanel() {
  return <OfficeCryptoRatesPanel />
}

export function WebhookInboxPanel() {
  return <EventInboxPanel />
}

/** @deprecated Use section-specific panels from platform-control hub */
export function PlatformSettingsPanel({ section }: { section?: SettingsAdminSection }) {
  return <SettingsAdminPanel section={section} />
}
