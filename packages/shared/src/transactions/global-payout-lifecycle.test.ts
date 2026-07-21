import { describe, expect, it } from "vitest"
import { buildGlobalPayoutLifecycle } from "./global-payout-lifecycle"

describe("buildGlobalPayoutLifecycle cross-border", () => {
  it("shows confirming payment before user attestation", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "pending",
      metadata: {
        yc_mode: "cross_border_send",
        quote_locked_at: "2026-07-16T10:00:00.000Z",
        leg1_status: "pending",
        local_pay_in: 1000,
        local_currency: "NGN",
        quote_expires_at: "2099-01-01T00:00:00.000Z",
      },
    })
    expect(steps).toHaveLength(2)
    expect(steps[0].id).toBe("confirming_payment")
    expect(steps[0].state).toBe("current")
    expect(steps[0].showPaymentDetailsLink).toBe(true)
    expect(steps[1].id).toBe("completed")
    expect(steps[1].state).toBe("upcoming")
  })

  it("shows bank-waiting copy after attestation in confirming step", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "pending",
      metadata: {
        yc_mode: "cross_border_send",
        quote_locked_at: "2026-07-16T10:00:00.000Z",
        payment_attested_at: "2026-07-16T10:05:00.000Z",
        local_pay_in: 1000,
        local_currency: "NGN",
      },
    })
    expect(steps[0].title).toBe("Processing payment")
    expect(steps[0].state).toBe("current")
    expect(steps[0].description).toBe("We're waiting for your bank to confirm the transfer.")
  })

  it("branches failed copy on failure_leg", () => {
    const leg1 = buildGlobalPayoutLifecycle({
      status: "failed",
      metadata: {
        yc_mode: "cross_border_send",
        failure_leg: "leg1",
        failed_at: "2026-07-16T11:00:00.000Z",
      },
    })
    expect(leg1[1]?.id).toBe("failed")
    expect(leg1[1]?.description).toContain("couldn't receive your local payment")

    const leg2 = buildGlobalPayoutLifecycle({
      status: "failed",
      metadata: {
        yc_mode: "cross_border_send",
        failure_leg: "leg2",
        failed_at: "2026-07-16T11:00:00.000Z",
      },
    })
    expect(leg2[1]?.description).toContain("couldn't complete the transfer to the recipient")
  })
})
