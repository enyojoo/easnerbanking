"use client"

import { Suspense, useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  PlatformCurrenciesPanel,
  PlatformSettingsPanel,
  IntegrationsHealthPanel,
  AuditLogPanel,
  NoahOperationsPanel,
  IndustryChecklistPanel,
  PayoutCorridorsPanel,
} from "@/components/platform-control/platform-control-panels"

const TABS = ["currencies", "settings", "corridors", "health", "audit", "noah", "industry"] as const
type PlatformControlTab = (typeof TABS)[number]

function isPlatformControlTab(v: string | null): v is PlatformControlTab {
  return v != null && (TABS as readonly string[]).includes(v)
}

function PlatformControlHubBody() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams.get("tab")
  const tab: PlatformControlTab = isPlatformControlTab(raw) ? raw : "currencies"

  const onTabChange = useCallback(
    (value: string) => {
      if (!isPlatformControlTab(value)) return
      const next = new URLSearchParams(searchParams.toString())
      next.set("tab", value)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform control</h1>
          <p className="text-gray-600 text-sm mt-1">Currencies, payout corridors, settings, integrations, audit, and Noah tools</p>
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
            <TabsTrigger value="currencies">Currencies</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="corridors">Payout corridors</TabsTrigger>
            <TabsTrigger value="health">Integrations and health</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
            <TabsTrigger value="noah">Noah operations</TabsTrigger>
            <TabsTrigger value="industry">Industry checklist</TabsTrigger>
          </TabsList>
          <TabsContent value="currencies">
            <PlatformCurrenciesPanel />
          </TabsContent>
          <TabsContent value="settings">
            <PlatformSettingsPanel />
          </TabsContent>
          <TabsContent value="corridors">
            <PayoutCorridorsPanel />
          </TabsContent>
          <TabsContent value="health">
            <IntegrationsHealthPanel />
          </TabsContent>
          <TabsContent value="audit">
            <AuditLogPanel />
          </TabsContent>
          <TabsContent value="noah">
            <NoahOperationsPanel />
          </TabsContent>
          <TabsContent value="industry">
            <IndustryChecklistPanel />
          </TabsContent>
        </Tabs>
      </div>
    </OfficeDashboardLayout>
  )
}

export default function PlatformControlPage() {
  return (
    <Suspense fallback={null}>
      <PlatformControlHubBody />
    </Suspense>
  )
}
