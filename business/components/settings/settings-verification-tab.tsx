"use client"

import { useState } from "react"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { BusinessVerificationSection } from "@/components/compliance/business-verification-section"
import { SettingsStripeConnectPanel } from "@/components/settings/settings-stripe-connect-panel"
import { VerificationTier2Card } from "@/components/settings/verification-tier2-card"
import { SETTINGS_TAB_COPY } from "@/lib/copy/business-ui-copy"
import { BUSINESS_TIER_LADDER } from "@/lib/compliance-tier-ladder-copy"
import { cn } from "@/lib/utils"
import { TIER2_COMPLETE_PLACEHOLDER } from "@/lib/compliance-placeholders"

function VerificationTierStepper({
  currentStep,
}: {
  currentStep: 1 | 2 | 3
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
      {BUSINESS_TIER_LADDER.tiers.map((tier, index) => {
        const step = tier.tier
        const done = step < currentStep
        const active = step === currentStep
        return (
          <li key={tier.tier} className="flex items-center gap-2 sm:gap-3">
            {index > 0 ? (
              <span className="hidden sm:block h-px w-6 bg-border" aria-hidden />
            ) : null}
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                active && "border-primary bg-primary/5 text-foreground",
                done && "border-border bg-muted/50 text-muted-foreground",
                !active && !done && "border-border text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-muted-foreground/20",
                  !active && !done && "bg-muted",
                )}
              >
                {tier.tier}
              </span>
              <span>{tier.title}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function SettingsVerificationTab() {
  const { invoiceSettings, tier1Complete } = useBusinessProfile()
  const showOnlinePayments = invoiceSettings?.showOnlinePayment !== false

  const currentStep: 1 | 2 | 3 = !tier1Complete
    ? 1
    : !TIER2_COMPLETE_PLACEHOLDER
      ? 2
      : 3

  const [tier2Expanded, setTier2Expanded] = useState(() => !showOnlinePayments)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{SETTINGS_TAB_COPY.verification.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{SETTINGS_TAB_COPY.verification.intro}</p>
      </div>

      <VerificationTierStepper currentStep={currentStep} />

      <BusinessVerificationSection />

      {showOnlinePayments ? (
        <div className="space-y-2">
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setTier2Expanded((v) => !v)}
          >
            {tier2Expanded ? "Hide Tier 2 (Cards)" : "Show Tier 2 (Cards)"}
          </button>
          {tier2Expanded ? <VerificationTier2Card /> : null}
        </div>
      ) : (
        <VerificationTier2Card />
      )}

      {showOnlinePayments ? <SettingsStripeConnectPanel /> : null}
    </div>
  )
}
