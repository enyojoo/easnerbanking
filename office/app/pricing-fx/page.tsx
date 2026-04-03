"use client"

import { Suspense, useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CommercialRulesPanel,
  CommercialProviderFeesPanel,
  CommercialRolloutPanel,
  HealthAndMetricsTabPanel,
  CommercialWebhookOpsPanel,
} from "@/components/commercial/pricing-fx-panels"

const TABS = ["rules", "provider-fees", "rollout", "health-metrics", "ops"] as const
type PricingFxTab = (typeof TABS)[number]

function isPricingFxTab(v: string | null): v is PricingFxTab {
  return v != null && (TABS as readonly string[]).includes(v)
}

function PricingFxHubBody() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams.get("tab")
  const tab: PricingFxTab = isPricingFxTab(raw) ? raw : "rules"

  const onTabChange = useCallback(
    (value: string) => {
      if (!isPricingFxTab(value)) return
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
          <h1 className="text-2xl font-bold text-gray-900">Pricing and FX</h1>
          <p className="text-gray-600 text-sm mt-1">Rules, provider baselines, rollout, health, metrics, and webhook replay</p>
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
            <TabsTrigger value="rules">Pricing rules</TabsTrigger>
            <TabsTrigger value="provider-fees">Provider fees</TabsTrigger>
            <TabsTrigger value="rollout">Rollout</TabsTrigger>
            <TabsTrigger value="health-metrics">Health and metrics</TabsTrigger>
            <TabsTrigger value="ops">Webhook replay</TabsTrigger>
          </TabsList>
          <TabsContent value="rules">
            <CommercialRulesPanel />
          </TabsContent>
          <TabsContent value="provider-fees">
            <CommercialProviderFeesPanel />
          </TabsContent>
          <TabsContent value="rollout">
            <CommercialRolloutPanel />
          </TabsContent>
          <TabsContent value="health-metrics">
            <HealthAndMetricsTabPanel />
          </TabsContent>
          <TabsContent value="ops">
            <CommercialWebhookOpsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </OfficeDashboardLayout>
  )
}

export default function PricingFxPage() {
  return (
    <Suspense fallback={<OfficeDashboardLayout><div className="p-6 text-sm text-muted-foreground">Loading…</div></OfficeDashboardLayout>}>
      <PricingFxHubBody />
    </Suspense>
  )
}
