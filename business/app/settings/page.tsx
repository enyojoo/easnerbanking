"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsPersonalTab } from "@/components/settings/settings-personal-tab"
import { SettingsBusinessTab } from "@/components/settings/settings-business-tab"
import { SettingsVerificationTab } from "@/components/settings/settings-verification-tab"
import { SettingsTeamTab } from "@/components/settings/settings-team-tab"
import { SettingsCommunicationTab } from "@/components/settings/settings-communication-tab"
import { SettingsRecipientsTab } from "@/components/settings/settings-recipients-tab"
import { SettingsCustomersTab } from "@/components/settings/settings-customers-tab"
import { SettingsInvoicingTab } from "@/components/settings/settings-invoicing-tab"
import { cn } from "@/lib/utils"

const TABS = ["personal", "business", "verification", "team", "recipients", "customers", "communication", "invoicing"] as const
type TabValue = (typeof TABS)[number]

function SettingsContent() {
  const searchParams = useSearchParams()
  const tab = (searchParams.get("tab") || "personal") as TabValue
  const validTab = TABS.includes(tab) ? tab : "personal"
  const [activeTab, setActiveTab] = useState<TabValue>(validTab)
  const [verificationFlowOpen, setVerificationFlowOpen] = useState(false)

  useEffect(() => {
    setActiveTab(validTab)
  }, [validTab])

  useEffect(() => {
    if (activeTab !== "verification") {
      setVerificationFlowOpen(false)
    }
  }, [activeTab])

  const handleTabChange = (value: string) => {
    if (!TABS.includes(value as TabValue)) return
    if (value === activeTab) return
    setActiveTab(value as TabValue)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", value)
    if (value !== "customers") {
      next.delete("customer")
    }
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/settings?${next.toString()}`)
    }
  }

  return (
    <div
      className={cn(
        verificationFlowOpen
          ? "flex h-full min-h-0 flex-col overflow-hidden"
          : "space-y-6",
      )}
    >
      <div className="shrink-0">
        <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className={cn("w-full", verificationFlowOpen && "flex min-h-0 flex-1 flex-col overflow-hidden")}
      >
        <TabsList className="w-full shrink-0 justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="recipients">Recipients</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
          <TabsTrigger value="invoicing">Invoicing</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-6">
          <SettingsPersonalTab />
        </TabsContent>
        <TabsContent value="business" className="mt-6">
          <SettingsBusinessTab />
        </TabsContent>
        <TabsContent value="verification" className={cn("mt-6", verificationFlowOpen && "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden")}>
          <SettingsVerificationTab onFlowOpenChange={setVerificationFlowOpen} />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <SettingsTeamTab />
        </TabsContent>
        <TabsContent value="recipients" className="mt-6">
          <SettingsRecipientsTab />
        </TabsContent>
        <TabsContent value="customers" className="mt-6">
          <SettingsCustomersTab />
        </TabsContent>
        <TabsContent value="communication" className="mt-6">
          <SettingsCommunicationTab />
        </TabsContent>
        <TabsContent value="invoicing" className="mt-6">
          <SettingsInvoicingTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  )
}
