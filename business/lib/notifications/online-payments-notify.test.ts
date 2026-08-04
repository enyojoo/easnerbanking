import { describe, expect, it } from "vitest"
import type { ConnectStatusSnapshot } from "@/lib/stripe/connect-panel-ux"
import {
  requirementsFingerprint,
  resolveOnlinePaymentsEmailKind,
} from "@/lib/notifications/online-payments-notify"

function snap(overrides: Partial<ConnectStatusSnapshot> = {}): ConnectStatusSnapshot {
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

describe("resolveOnlinePaymentsEmailKind", () => {
  it("sends setup_started when account first appears", () => {
    const result = resolveOnlinePaymentsEmailKind({
      previous: null,
      next: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: false,
      }),
      notifications: {},
    })
    expect(result).toEqual({ kind: "setup_started" })
  })

  it("does not re-send setup_started when already recorded", () => {
    const result = resolveOnlinePaymentsEmailKind({
      previous: null,
      next: snap({ stripeAccountId: "acct_1" }),
      notifications: { setupStartedAt: "2026-08-01T00:00:00.000Z" },
    })
    expect(result?.kind).not.toBe("setup_started")
  })

  it("sends action_required when entering requirements_due", () => {
    const result = resolveOnlinePaymentsEmailKind({
      previous: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
      }),
      next: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        requirementsCurrentlyDue: ["business_profile.url"],
      }),
      notifications: { setupStartedAt: "2026-08-01T00:00:00.000Z" },
    })
    expect(result?.kind).toBe("action_required")
    expect(result?.fingerprint).toBe("business_profile.url")
  })

  it("re-sends action_required when due fingerprint changes", () => {
    const result = resolveOnlinePaymentsEmailKind({
      previous: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        requirementsCurrentlyDue: ["business_profile.url"],
      }),
      next: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        requirementsCurrentlyDue: ["company.tax_id"],
      }),
      notifications: {
        setupStartedAt: "2026-08-01T00:00:00.000Z",
        actionRequiredFingerprint: "business_profile.url",
      },
    })
    expect(result?.kind).toBe("action_required")
    expect(result?.fingerprint).toBe("company.tax_id")
  })

  it("does not re-send action_required for same fingerprint", () => {
    const result = resolveOnlinePaymentsEmailKind({
      previous: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        requirementsCurrentlyDue: ["business_profile.url"],
      }),
      next: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        requirementsCurrentlyDue: ["business_profile.url"],
      }),
      notifications: {
        setupStartedAt: "2026-08-01T00:00:00.000Z",
        actionRequiredFingerprint: "business_profile.url",
      },
    })
    expect(result).toBeNull()
  })

  it("sends ready once when phase becomes ready", () => {
    const result = resolveOnlinePaymentsEmailKind({
      previous: snap({
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        transfersEnabled: true,
        payoutsEnabled: true,
        externalAccountLinked: false,
        hasGridVa: true,
      }),
      next: snap({
        ready: true,
        stripeAccountId: "acct_1",
        detailsSubmitted: true,
        transfersEnabled: true,
        payoutsEnabled: true,
        externalAccountLinked: true,
        hasGridVa: true,
      }),
      notifications: { setupStartedAt: "2026-08-01T00:00:00.000Z" },
    })
    expect(result).toEqual({ kind: "ready" })
  })

  it("does not re-send ready", () => {
    const result = resolveOnlinePaymentsEmailKind({
      previous: snap({ ready: true, stripeAccountId: "acct_1" }),
      next: snap({ ready: true, stripeAccountId: "acct_1" }),
      notifications: {
        setupStartedAt: "2026-08-01T00:00:00.000Z",
        readyAt: "2026-08-02T00:00:00.000Z",
      },
    })
    expect(result).toBeNull()
  })

  it("fingerprints requirements stably", () => {
    expect(requirementsFingerprint(["b", "a"])).toBe("a|b")
    expect(requirementsFingerprint([])).toBe("")
  })
})
