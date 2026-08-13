import { describe, expect, it } from "vitest"
import { resolveConnectPanelPhase, resolveConnectPanelUx } from "./connect-panel-ux"
import type { ConnectStatusSnapshot } from "./connect-panel-ux"
import { optimisticConnectStatus } from "./connect-status-cache"

function base(overrides: Partial<ConnectStatusSnapshot> = {}): ConnectStatusSnapshot {
  return {
    enabled: true,
    connectEnabled: true,
    ready: false,
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

describe("resolveConnectPanelUx", () => {
  it("shows minimal start CTA for new accounts", () => {
    const ux = resolveConnectPanelUx(base())
    expect(ux.primary?.label).toBe("Get started")
    expect(ux.primary?.dialogTitle).toBe("Set up online payments")
    expect(ux.secondary).toBeUndefined()
  })

  it("optimistic first paint matches the not-started card", () => {
    const ux = resolveConnectPanelUx(optimisticConnectStatus())
    expect(ux.phase).toBe("not_started")
    expect(ux.badgeLabel).toBe("Not started")
    expect(ux.primary?.label).toBe("Get started")
  })

  it("shows link payout as primary when almost ready", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        transfersEnabled: true,
        payoutsEnabled: true,
      }),
    )
    expect(ux.primary?.kind).toBe("link_payout")
    expect(ux.primary?.label).toBe("Link payouts")
    expect(ux.secondary).toBeUndefined()
  })

  it("shows one onboarding CTA when requirements are due", () => {
    const ux = resolveConnectPanelUx(
      base({
        stripeAccountId: "acct_1",
        requirementsCurrentlyDue: ["company.tax_id"],
      }),
    )
    expect(ux.phase).toBe("requirements_due")
    expect(ux.primary?.label).toBe("Complete")
    expect(ux.primary?.dialogTitle).toBe("Complete requirements")
    expect(ux.secondary).toBeUndefined()
  })

  it("shows no CTAs when ready", () => {
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
    expect(ux.badgeLabel).toBe("Ready")
    expect(ux.primary).toBeUndefined()
    expect(ux.secondary).toBeUndefined()
    expect(ux.summary).toBeUndefined()
  })

  it("shows no CTAs while verification is pending", () => {
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
