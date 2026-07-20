import { describe, expect, it } from "vitest"
import { buildGlobalPayoutLifecycle } from "./global-payout-lifecycle"

describe("buildGlobalPayoutLifecycle cross-border", () => {
  it("shows awaiting transfer before user attestation", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "pending",
      metadata: {
        yc_mode: "cross_border_send",
        quote_locked_at: "2026-07-16T10:00:00.000Z",
        leg1_status: "pending",
      },
    })
    expect(steps).toHaveLength(3)
    expect(steps[0].id).toBe("awaiting_transfer")
    expect(steps[0].state).toBe("current")
    expect(steps[1].id).toBe("processing")
    expect(steps[1].state).toBe("upcoming")
  })

  it("shows confirming payment after attestation", () => {
    const steps = buildGlobalPayoutLifecycle({
      status: "pending",
      metadata: {
        yc_mode: "cross_border_send",
        quote_locked_at: "2026-07-16T10:00:00.000Z",
        payment_attested_at: "2026-07-16T10:05:00.000Z",
      },
    })
    expect(steps[1].title).toBe("Confirming payment")
    expect(steps[1].state).toBe("current")
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
    expect(leg1[1].description).toMatch(/couldn't receive your local payment/i)

    const leg2 = buildGlobalPayoutLifecycle({
      status: "failed",
      metadata: {
        yc_mode: "cross_border_send",
        failure_leg: "leg2",
        failed_at: "2026-07-16T11:00:00.000Z",
      },
    })
    expect(leg2[1].description).toMatch(/received your payment but couldn't complete/i)
  })
})
