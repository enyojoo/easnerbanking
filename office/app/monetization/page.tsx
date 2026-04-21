"use client"

import { Suspense, useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CommercialPlansPanel,
  CommercialSubscriptionsPanel,
  CommercialPromoPanel,
  CommercialLimitsPanel,
} from "@/components/commercial/monetization-panels"

const TABS = ["plans", "subscriptions", "promo", "limits"] as const
type MonetizationTab = (typeof TABS)[number]

function isMonetizationTab(v: string | null): v is MonetizationTab {
  return v != null && (TABS as readonly string[]).includes(v)
}

function MonetizationHubBody() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = searchParams.get("tab")
  const tab: MonetizationTab = isMonetizationTab(raw) ? raw : "plans"

  const onTabChange = useCallback(
    (value: string) => {
      if (!isMonetizationTab(value)) return
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
          <h1 className="text-2xl font-bold text-gray-900">Monetization</h1>
          <p className="text-gray-600 text-sm mt-1">Plans, subscriptions, promotions, and limit policies</p>
        </div>

        <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="promo">Promotions</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
          </TabsList>
          <TabsContent value="plans">
            <CommercialPlansPanel />
          </TabsContent>
          <TabsContent value="subscriptions">
            <CommercialSubscriptionsPanel />
          </TabsContent>
          <TabsContent value="promo">
            <CommercialPromoPanel />
          </TabsContent>
          <TabsContent value="limits">
            <CommercialLimitsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </OfficeDashboardLayout>
  )
}

export default function MonetizationPage() {
  return (
    <Suspense fallback={null}>
      <MonetizationHubBody />
    </Suspense>
  )
}
