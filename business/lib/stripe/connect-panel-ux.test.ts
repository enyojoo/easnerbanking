import { describe, expect, it } from "vitest"
import {
  connectPanelVerificationPresentation,
  resolveConnectPanelPhase,
  resolveConnectPanelUx,
} from "./connect-panel-ux"
import type { ConnectStatusSnapshot } from "./connect-panel-ux"
import { optimisticConnectStatus } from "./connect-status-cache"
import { NOAH_VERIFICATION_IN_REVIEW_COPY } from "@easner/shared"
import { VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"

function base(overrides: Partial<ConnectStatusSnapshot> = {}): ConnectStatusSnapshot {
  return {
    enabled: true,
    connectEnabled: true,
    ready: false,
    tier1Complete: true,
    stripeAccountId: null,
    transfersEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    externalAccountLinked: false,
    hasGridVa: true,
    requirementsCurrentlyDue: [],
    ...overrides,
  }
}

describe("resolveConnectPanelPhase", () => {
  it("returns not_started without a Stripe account", () => {
    expect(resolveConnectPanelPhase(base())).toBe("not_started")
  })

  it("returns link_payout when verification done but VA not linked", () => {
    expect(
      resolveConnectPanelPhase(
        base({
          stripeAccountId: "acct_1",
          detailsSubmitted: true,
          transfersEnabled: true,
          payoutsEnabled: true,
          externalAccountLinked: false,
        }),
      ),
    ).toBe("link_payout")
  })

  it("returns ready when all gates pass", () => {
    expect(
      resolveConnectPanelPhase(
        base({
          ready: true,
          stripeAccountId: "acct_1",
          detailsSubmitted: true,
          transfersEnabled: true,
          payoutsEnabled: true,
          externalAccountLinked: true,
        }),
      ),
    ).toBe("ready")
  })
})

describe("connectPanelVerificationPresentation", () => {
  it("maps phases to Tier 1 verification status vocabulary", () => {
    expect(connectPanelVerificationPresentation("not_started", false)).toEqual({
      status: "not_started",
      complete: false,
    })
    expect(connectPanelVerificationPresentation("link_payout", false)).toEqual({
      status: "hold",
      complete: false,
    })
    expect(connectPanelVerificationPresentation("ready", true)).toEqual({
      status: "approved",
      complete: true,
    })
  })
})

describe("resolveConnectPanelUx", () => {
  it("optimistic first paint waits on Tier 1 before online payments verification", () => {
    const ux = resolveConnectPanelUx(optimisticConnectStatus())
    expect(ux.phase).toBe("kyb_required")
    expect(ux.verificationStatus).toBe("not_started")
    expect(ux.bodyCopy).toBe(VERIFICATION_SECTION_COPY.onlinePaymentsTier1Required)
    expect(ux.primary).toBeUndefined()
  })

  it("locks online payments until Tier 1 is approved", () => {
    const ux = resolveConnectPanelUx(
      base({
        tier1Complete: false,
        reason: "Complete business verification first to set up online payments",
      }),
    )
    expect(ux.phase).toBe("kyb_required")
    expect(ux.primary).toBeUndefined()
    expect(ux.bodyCopy).toBe(VERIFICATION_SECTION_COPY.onlinePaymentsTier1Required)
  })

  it("shows Begin verification after Tier 1 is approved", () => {
    const ux = resolveConnectPanelUx(base())
    expect(ux.primary?.label).toBe("Begin verification")
    expect(ux.primary?.dialogTitle).toBe("Online payment verification")
    expect(ux.secondary).toBeUndefined()
  })

  it("shows Continue verification when Stripe onboarding started", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: false,
        hasGridVa: true,
        externalAccountLinked: true,
      }),
    )
    expect(ux.phase).toBe("in_progress")
    expect(ux.primary?.label).toBe("Continue verification")
    expect(ux.primary?.dialogTitle).toBe("Continue verification")
  })

  it("shows Link Account when Stripe is waiting on an external account", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: false,
        hasGridVa: true,
        requirementsCurrentlyDue: ["external_account"],
      }),
    )
    expect(ux.phase).toBe("link_payout")
    expect(ux.primary?.kind).toBe("link_payout")
    expect(ux.primary?.label).toBe("Link Account")
    expect(ux.verificationStatus).toBe("hold")
  })

  it("shows provisioning copy when USD account is missing during onboarding", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: false,
        hasGridVa: false,
      }),
    )
    expect(ux.phase).toBe("missing_virtual_account")
    expect(ux.primary).toBeUndefined()
  })

  it("shows Link Account when payouts still need the Grid VA", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        transfersEnabled: true,
        payoutsEnabled: true,
      }),
    )
    expect(ux.primary?.kind).toBe("link_payout")
    expect(ux.primary?.label).toBe("Link Account")
    expect(ux.secondary).toBeUndefined()
  })

  it("shows Continue verification when requirements are due", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        requirementsCurrentlyDue: ["company.tax_id"],
      }),
    )
    expect(ux.phase).toBe("requirements_due")
    expect(ux.primary?.label).toBe("Continue verification")
    expect(ux.bodyCopy).toBe(VERIFICATION_SECTION_COPY.verificationOnHold)
    expect(ux.checklist.some((item) => item.label === "Tax ID" && !item.done)).toBe(true)
  })

  it("does not treat platform ToS as action needed", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        transfersEnabled: true,
        payoutsEnabled: true,
        externalAccountLinked: true,
        hasGridVa: true,
        requirementsCurrentlyDue: ["tos_acceptance.date"],
      }),
    )
    expect(ux.phase).toBe("pending_review")
  })

  it("shows in-review copy with no CTA while Stripe reviews", () => {
    const ux = resolveConnectPanelUx(
      base({
        ready: true,
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        transfersEnabled: true,
        payoutsEnabled: true,
        externalAccountLinked: true,
      }),
    )
    expect(ux.verificationComplete).toBe(true)
    expect(ux.primary).toBeUndefined()
    expect(ux.secondary).toBeUndefined()
    expect(ux.bodyCopy).toBeUndefined()
  })

  it("shows in-review copy while Stripe verification is pending", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        transfersEnabled: true,
        payoutsEnabled: false,
        externalAccountLinked: true,
        hasGridVa: true,
      }),
    )
    expect(ux.phase).toBe("activating")
    expect(ux.bodyCopy).toBe(NOAH_VERIFICATION_IN_REVIEW_COPY)
    expect(ux.primary).toBeUndefined()
  })

  it("shows no CTA while USD account is still provisioning", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        hasGridVa: false,
      }),
    )
    expect(ux.phase).toBe("missing_virtual_account")
    expect(ux.primary).toBeUndefined()
    expect(ux.secondary).toBeUndefined()
  })
})
