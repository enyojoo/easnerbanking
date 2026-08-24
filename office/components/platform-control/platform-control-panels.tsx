"use client"

import { SettingsAdminPanel } from "@/components/settings/settings-admin-panel"
import { ExpressDepositsFeeAdminPanel } from "@/components/platform-control/express-deposits-fee-admin-panel"
import { PayoutCorridorsAdminPanel } from "@/components/platform-control/payout-corridors-admin-panel"
import { CryptoDestinationsAdminPanel } from "@/components/platform-control/crypto-destinations-admin-panel"
import { OfficeNoahRatesPanel } from "@/components/settings/office-noah-rates-panel"
import { OfficeYcRatesPanel } from "@/components/settings/office-yc-rates-panel"
import { OfficeGridRatesPanel } from "@/components/settings/office-grid-rates-panel"
import { OfficeCryptoRatesPanel } from "@/components/settings/office-crypto-rates-panel"
import { EventInboxPanel } from "@/components/platform-control/event-inbox-panel"

export function PlatformConfigPanel() {
  return (
    <div className="space-y-6">
      <SettingsAdminPanel section="platform" />
      <ExpressDepositsFeeAdminPanel />
    </div>
  )
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

export function GridRatesPanel() {
  return <OfficeGridRatesPanel />
}

export function CryptoRatesPanel() {
  return <OfficeCryptoRatesPanel />
}

export function WebhookInboxPanel() {
  return <EventInboxPanel />
}
