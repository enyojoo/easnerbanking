"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
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
import { useBusinessProfile } from "@/lib/use-business-profile"
import { primeConnectStatus } from "@/lib/stripe/connect-status-cache"
import {
  parseSettingsVerificationFlow,
  type SettingsVerificationEmbeddedFlow,
} from "@/lib/compliance/cutover-comms"
import { primeBusinessVerificationFlow } from "@/lib/compliance/prime-business-verification-flow"
import { usePrimeKybPacket } from "@/lib/grid/kyb-packet-query"
import { cn } from "@/lib/utils"

const TABS = ["personal", "business", "verification", "team", "recipients", "customers", "communication", "invoicing"] as const
type TabValue = (typeof TABS)[number]

function SettingsContent() {
  const searchParams = useSearchParams()
  const tab = (searchParams.get("tab") || "personal") as TabValue
  const validTab = TABS.includes(tab) ? tab : "personal"
  const flowFromUrl = validTab === "verification" ? parseSettingsVerificationFlow(searchParams.get("flow")) : null
  const [verificationFlow, setVerificationFlow] = useState<SettingsVerificationEmbeddedFlow | null>(
    flowFromUrl,
  )
  const verificationChromeHidden = validTab === "verification" && verificationFlow != null
  const [activeTab, setActiveTab] = useState<TabValue>(validTab)
  const {
    businessId,
    canManageBusinessVerification,
    tier1Complete,
    tier1CanResubmit,
  } = useBusinessProfile()

  useEffect(() => {
    setVerificationFlow(flowFromUrl)
  }, [flowFromUrl])

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      setVerificationFlow(
        params.get("tab") === "verification"
          ? parseSettingsVerificationFlow(params.get("flow"))
          : null,
      )
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const handleVerificationFlowOpenChange = useCallback(
    (open: boolean, flow?: SettingsVerificationEmbeddedFlow) => {
      setVerificationFlow(open ? (flow ?? flowFromUrl) : null)
    },
    [flowFromUrl],
  )

  useEffect(() => {
    setActiveTab(validTab)
  }, [validTab])

  usePrimeKybPacket(Boolean(businessId && canManageBusinessVerification))

  useEffect(() => {
    primeConnectStatus(businessId)
  }, [businessId])

  useEffect(() => {
    primeBusinessVerificationFlow({
      businessId,
      canManageBusinessVerification,
      tier1Complete,
      tier1CanResubmit,
    })
  }, [businessId, canManageBusinessVerification, tier1Complete, tier1CanResubmit])

  const handleTabChange = (value: string) => {
    if (!TABS.includes(value as TabValue)) return
    if (value === activeTab) return
    setActiveTab(value as TabValue)
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", value)
    if (value !== "customers") {
      next.delete("customer")
    }
    if (value !== "verification") {
      next.delete("flow")
      setVerificationFlow(null)
    }
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/settings?${next.toString()}`)
    }
    if (value === "verification") {
      primeBusinessVerificationFlow({
        businessId,
        canManageBusinessVerification,
        tier1Complete,
        tier1CanResubmit,
      })
    }
  }

  return (
    <div className={cn(verificationChromeHidden ? "flex min-h-0 flex-1 flex-col" : "space-y-6")}>
      {!verificationChromeHidden ? (
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className={cn("w-full", verificationChromeHidden && "flex min-h-0 flex-1 flex-col")}
      >
        {!verificationChromeHidden ? (
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
        ) : null}

        <TabsContent value="personal" className="mt-6">
          <SettingsPersonalTab />
        </TabsContent>
        <TabsContent value="business" className="mt-6">
          <SettingsBusinessTab />
        </TabsContent>
        <TabsContent
          value="verification"
          className={verificationChromeHidden ? "mt-0 flex min-h-0 flex-1 flex-col" : "mt-6"}
        >
          <SettingsVerificationTab
            fullPageFlow={verificationChromeHidden}
            embeddedFlow={verificationFlow}
            onFlowOpenChange={handleVerificationFlowOpenChange}
          />
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
