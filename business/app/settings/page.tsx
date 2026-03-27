"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsPersonalTab } from "@/components/settings/settings-personal-tab"
import { SettingsBusinessTab } from "@/components/settings/settings-business-tab"
import { SettingsTeamTab } from "@/components/settings/settings-team-tab"
import { SettingsCommunicationTab } from "@/components/settings/settings-communication-tab"

const TABS = ["personal", "business", "team", "communication"] as const
type TabValue = (typeof TABS)[number]

function SettingsContent() {
  const searchParams = useSearchParams()
  const tab = (searchParams.get("tab") || "personal") as TabValue
  const validTab = TABS.includes(tab) ? tab : "personal"
  const [activeTab, setActiveTab] = useState<TabValue>(validTab)

  useEffect(() => {
    setActiveTab(validTab)
  }, [validTab])

  const handleTabChange = (value: string) => {
    if (!TABS.includes(value as TabValue)) return
    if (value === activeTab) return
    setActiveTab(value as TabValue)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", value)
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/settings?${next.toString()}`)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="communication">Communication</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-6">
          <SettingsPersonalTab />
        </TabsContent>
        <TabsContent value="business" className="mt-6">
          <SettingsBusinessTab />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <SettingsTeamTab />
        </TabsContent>
        <TabsContent value="communication" className="mt-6">
          <SettingsCommunicationTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-muted rounded-lg" />}>
      <SettingsContent />
    </Suspense>
  )
}
