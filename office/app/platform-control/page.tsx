"use client"

import { Suspense, useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  PlatformConfigPanel,
  FiatPanel,
  CryptoPanel,
  NoahRatesPanel,
  YcRatesPanel,
  CryptoRatesPanel,
  WebhookInboxPanel,
} from "@/components/platform-control/platform-control-panels"

const TABS = ["platform", "noah-rates", "yc-rates", "crypto-rates", "fiat", "crypto", "webhooks"] as const
type PlatformControlTab = (typeof TABS)[number]

function normalizeTab(raw: string | null): string | null {
  if (raw === "balance-currencies") return "platform"
  if (raw === "rates") return "platform"
  return raw
}

function isPlatformControlTab(v: string | null): v is PlatformControlTab {
  return v != null && (TABS as readonly string[]).includes(v)
}

const TAB_CONTENT_CLASS = "mt-0 focus-visible:outline-none"

function PlatformControlHubBody() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const raw = normalizeTab(searchParams.get("tab"))
  const validTab: PlatformControlTab = isPlatformControlTab(raw) ? raw : "platform"
  const [activeTab, setActiveTab] = useState<PlatformControlTab>(validTab)

  useEffect(() => {
    setActiveTab(validTab)
  }, [validTab])

  const onTabChange = (value: string) => {
    if (!isPlatformControlTab(value)) return
    if (value === activeTab) return
    setActiveTab(value)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", value)
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${pathname}?${next.toString()}`)
    }
  }

  return (
    <OfficeDashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform control</h1>
        </div>

        <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
            <TabsTrigger value="platform">Platform</TabsTrigger>
            <TabsTrigger value="noah-rates">Noah rates</TabsTrigger>
            <TabsTrigger value="yc-rates">Yellowcard rates</TabsTrigger>
            <TabsTrigger value="crypto-rates">Crypto rates</TabsTrigger>
            <TabsTrigger value="fiat">Fiat corridors</TabsTrigger>
            <TabsTrigger value="crypto">Crypto</TabsTrigger>
            <TabsTrigger value="webhooks">Webhook inbox</TabsTrigger>
          </TabsList>
          <TabsContent value="platform" className={TAB_CONTENT_CLASS}>
            <PlatformConfigPanel />
          </TabsContent>
          <TabsContent value="noah-rates" className={TAB_CONTENT_CLASS}>
            <NoahRatesPanel />
          </TabsContent>
          <TabsContent value="yc-rates" className={TAB_CONTENT_CLASS}>
            <YcRatesPanel />
          </TabsContent>
          <TabsContent value="crypto-rates" className={TAB_CONTENT_CLASS}>
            <CryptoRatesPanel />
          </TabsContent>
          <TabsContent value="fiat" className={TAB_CONTENT_CLASS}>
            <FiatPanel />
          </TabsContent>
          <TabsContent value="crypto" className={TAB_CONTENT_CLASS}>
            <CryptoPanel />
          </TabsContent>
          <TabsContent value="webhooks" className={TAB_CONTENT_CLASS}>
            <WebhookInboxPanel />
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
