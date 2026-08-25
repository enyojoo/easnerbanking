"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Only ONE tab renders at a time (Radix mounts active content only), but
 * static imports shipped the union of all nine tabs' code — including the
 * Stripe Connect SDK and the KYB wizard — on every /settings visit
 * (~150 KB gzip). Each tab is its own chunk; inactive ones preload at idle
 * so switching stays instant.
 */
const TAB_MODULE_LOADERS = [
  () => import("@/components/settings/settings-personal-tab"),
  () => import("@/components/settings/settings-business-tab"),
  () => import("@/components/settings/settings-verification-tab"),
  () => import("@/components/settings/settings-team-tab"),
  () => import("@/components/settings/settings-communication-tab"),
  () => import("@/components/settings/settings-recipients-tab"),
  () => import("@/components/settings/settings-customers-tab"),
  () => import("@/components/settings/settings-invoicing-tab"),
  () => import("@/components/settings/settings-payments-tab"),
] as const

const SettingsPersonalTab = dynamic(() =>
  import("@/components/settings/settings-personal-tab").then((m) => m.SettingsPersonalTab),
)
const SettingsBusinessTab = dynamic(() =>
  import("@/components/settings/settings-business-tab").then((m) => m.SettingsBusinessTab),
)
const SettingsVerificationTab = dynamic(() =>
  import("@/components/settings/settings-verification-tab").then((m) => m.SettingsVerificationTab),
)
const SettingsTeamTab = dynamic(() =>
  import("@/components/settings/settings-team-tab").then((m) => m.SettingsTeamTab),
)
const SettingsCommunicationTab = dynamic(() =>
  import("@/components/settings/settings-communication-tab").then((m) => m.SettingsCommunicationTab),
)
const SettingsRecipientsTab = dynamic(() =>
  import("@/components/settings/settings-recipients-tab").then((m) => m.SettingsRecipientsTab),
)
const SettingsCustomersTab = dynamic(() =>
  import("@/components/settings/settings-customers-tab").then((m) => m.SettingsCustomersTab),
)
const SettingsInvoicingTab = dynamic(() =>
  import("@/components/settings/settings-invoicing-tab").then((m) => m.SettingsInvoicingTab),
)
const SettingsPaymentsTab = dynamic(() =>
  import("@/components/settings/settings-payments-tab").then((m) => m.SettingsPaymentsTab),
)
import { useBusinessProfile } from "@/lib/use-business-profile"
import { primeConnectStatus } from "@/lib/stripe/connect-status-cache"
import {
  parseSettingsVerificationFlow,
  type SettingsVerificationEmbeddedFlow,
} from "@/lib/compliance/cutover-comms"
import { primeBusinessVerificationFlow } from "@/lib/compliance/prime-business-verification-flow"
import { usePrimeKybPacket } from "@/lib/grid/kyb-packet-query"
import { usePrimeExpressOnrampStatus } from "@/hooks/queries/use-express-onramp-status-query"
import { cn } from "@/lib/utils"

const TABS = ["personal", "business", "verification", "payments", "team", "recipients", "customers", "communication", "invoice"] as const
type TabValue = (typeof TABS)[number]

function parseSettingsTab(raw: string | null): TabValue {
  if (raw === "invoicing" || raw === "invoice") return "invoice"
  if (raw && TABS.includes(raw as TabValue)) return raw as TabValue
  return "personal"
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const tab = parseSettingsTab(searchParams.get("tab"))
  const validTab = tab
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

  useEffect(() => {
    if (typeof window === "undefined") return
    if (searchParams.get("tab") !== "invoicing") return
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", "invoice")
    window.history.replaceState(null, "", `/settings?${next.toString()}`)
  }, [searchParams])

  usePrimeKybPacket(Boolean(businessId && canManageBusinessVerification))
  usePrimeExpressOnrampStatus(true)

  // Warm the inactive tab chunks at idle so switching tabs never waits on a
  // network chunk load.
  useEffect(() => {
    if (typeof window === "undefined") return
    const w = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (id: number) => void
    }
    const warm = () => {
      for (const load of TAB_MODULE_LOADERS) void load().catch(() => {})
    }
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(warm, { timeout: 3_000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(warm, 1_000)
    return () => window.clearTimeout(id)
  }, [])

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
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="recipients">Recipients</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="communication">Communication</TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
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
        <TabsContent value="payments" className="mt-6">
          <SettingsPaymentsTab />
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
        <TabsContent value="invoice" className="mt-6">
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
