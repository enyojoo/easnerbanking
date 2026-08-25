"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Only ONE tab renders at a time (Radix mounts active content only), but
 * static imports shipped the union of all nine tabs' code — including the
 * Stripe Connect SDK and the KYB wizard — on every /settings visit
 * (~150 KB gzip). Each tab is its own chunk. Per the Instant Standard the
 * split must be INVISIBLE: the default tab is static (instant landing),
 * chunks warm at workspace idle and on trigger hover, and a tab switch
 * waits for its chunk (see handleTabChange) so content never flashes empty.
 */
import {
  isSettingsTabLoaded,
  loadSettingsTab,
  warmSettingsTabModules,
  type SettingsTabValue,
} from "./tab-loaders"
import { SettingsPersonalTab } from "@/components/settings/settings-personal-tab"

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

  // Warm every tab chunk the moment the page mounts (the deep-linked tab
  // first, then the rest). The workspace idle warm usually already cached
  // them before the user got here.
  useEffect(() => {
    void loadSettingsTab(validTab as SettingsTabValue)
    warmSettingsTabModules()
  }, [validTab])

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

    const applySwitch = () => {
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

    // Instant Standard: never flash an empty pane. If the tab's chunk isn't
    // cached yet (rare — chunks warm at workspace idle, page mount, and
    // trigger hover), keep showing the current tab for the few ms the load
    // takes and switch when it's ready.
    if (value === "personal" || isSettingsTabLoaded(value as SettingsTabValue)) {
      applySwitch()
      return
    }
    void loadSettingsTab(value as SettingsTabValue).then(applySwitch)
  }

  /** Hover warm so a click can always switch synchronously. */
  const warmTab = (value: SettingsTabValue) => {
    void loadSettingsTab(value)
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
            <TabsTrigger value="business" onPointerEnter={() => warmTab("business")}>Business</TabsTrigger>
            <TabsTrigger value="verification" onPointerEnter={() => warmTab("verification")}>Verification</TabsTrigger>
            <TabsTrigger value="payments" onPointerEnter={() => warmTab("payments")}>Payments</TabsTrigger>
            <TabsTrigger value="team" onPointerEnter={() => warmTab("team")}>Team</TabsTrigger>
            <TabsTrigger value="recipients" onPointerEnter={() => warmTab("recipients")}>Recipients</TabsTrigger>
            <TabsTrigger value="customers" onPointerEnter={() => warmTab("customers")}>Customers</TabsTrigger>
            <TabsTrigger value="communication" onPointerEnter={() => warmTab("communication")}>Communication</TabsTrigger>
            <TabsTrigger value="invoice" onPointerEnter={() => warmTab("invoice")}>Invoice</TabsTrigger>
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
