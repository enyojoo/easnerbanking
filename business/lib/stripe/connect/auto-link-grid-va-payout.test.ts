import { describe, expect, it, vi, beforeEach } from "vitest"
import { autoLinkGridVaPayoutIfEligible } from "./auto-link-grid-va-payout"

vi.mock("./reconcile-grid-va-payout", () => ({
  reconcileGridVaPayoutDestination: vi.fn(),
}))

import { reconcileGridVaPayoutDestination } from "./reconcile-grid-va-payout"

const admin = {} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe("autoLinkGridVaPayoutIfEligible", () => {
  it("skips when reconciliation is not eligible", async () => {
    vi.mocked(reconcileGridVaPayoutDestination).mockResolvedValue({
      skipped: true,
      reason: "details_not_submitted",
    })
    const result = await autoLinkGridVaPayoutIfEligible(admin, { businessId: "biz_1" })
    expect(result).toEqual({ skipped: true, reason: "details_not_submitted" })
  })

  it("reconciles even when a payout link already exists in DB", async () => {
    vi.mocked(reconcileGridVaPayoutDestination).mockResolvedValue({
      skipped: false,
      ok: true,
      action: "verified",
      stripeExternalAccountId: "ba_1",
    })
    const result = await autoLinkGridVaPayoutIfEligible(admin, { businessId: "biz_1" })
    expect(result).toEqual({
      skipped: false,
      ok: true,
      action: "verified",
      stripeExternalAccountId: "ba_1",
    })
  })
})
