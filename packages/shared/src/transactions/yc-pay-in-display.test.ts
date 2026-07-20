import { describe, expect, it } from "vitest"
import {
  YC_PAY_IN_AWAITING_STATUS,
  buildYcPayInLifecycle,
  isYcPayInAwaitingAttestation,
  ledgerTransactionStatusDisplayForRow,
  resolveYcPayInFeedStatus,
  resolveYcPayInUserWhenAt,
} from "./yc-pay-in-display"

describe("yc pay-in display", () => {
  it("detects awaiting attestation for YC cross-border pending", () => {
    expect(
      isYcPayInAwaitingAttestation({ yc_mode: "cross_border_send" }, "pending"),
    ).toBe(true)
    expect(resolveYcPayInFeedStatus({ yc_mode: "fund_balance" }, "pending")).toBe(
      YC_PAY_IN_AWAITING_STATUS,
    )
  })

  it("stops awaiting after attestation", () => {
    const meta = {
      yc_mode: "cross_border_send",
      payment_attested_at: "2026-01-02T00:00:00.000Z",
    }
    expect(isYcPayInAwaitingAttestation(meta, "pending")).toBe(false)
  })

  it("prefers attestation over lock for user when", () => {
    expect(
      resolveYcPayInUserWhenAt({
        quote_locked_at: "2026-01-01T00:00:00.000Z",
        payment_attested_at: "2026-01-02T00:00:00.000Z",
      }),
    ).toBe("2026-01-02T00:00:00.000Z")
  })

  it("shows Awaiting payment label before attestation", () => {
    expect(
      ledgerTransactionStatusDisplayForRow("pending", { yc_mode: "fund_balance" }).label,
    ).toBe("Awaiting payment")
  })

  it("builds awaiting-payment lifecycle before attestation", () => {
    const steps = buildYcPayInLifecycle({
      status: "pending",
      metadata: {
        yc_mode: "cross_border_send",
        quote_locked_at: "2026-01-01T00:00:00.000Z",
        local_pay_in: 1000,
        local_currency: "NGN",
        quote_expires_at: "2099-01-01T00:00:00.000Z",
      },
      crossBorder: true,
      nowMs: Date.parse("2026-01-01T12:00:00.000Z"),
    })
    expect(steps[0]?.id).toBe("awaiting_transfer")
    expect(steps[0]?.title).toBe("Awaiting payment")
    expect(steps[0]?.state).toBe("current")
    expect(steps[0]?.showPaymentDetailsLink).toBe(true)
  })

  it("shows expired lifecycle copy after the payment window closes", () => {
    const steps = buildYcPayInLifecycle({
      status: "pending",
      metadata: {
        yc_mode: "fund_balance",
        quote_locked_at: "2026-01-01T00:00:00.000Z",
        quote_expires_at: "2026-01-01T00:05:00.000Z",
        local_pay_in: 1000,
        local_currency: "NGN",
      },
      nowMs: Date.parse("2026-01-01T00:10:00.000Z"),
    })
    expect(steps[0]?.description).toBe(
      "The time to complete this transfer has passed — contact support with your transaction ID.",
    )
    expect(steps[0]?.showPaymentDetailsLink).toBe(false)
  })

  it("still shows payment link when expiry is unknown (legacy rows)", () => {
    const steps = buildYcPayInLifecycle({
      status: "pending",
      metadata: {
        yc_mode: "fund_balance",
        quote_locked_at: "2026-01-01T00:00:00.000Z",
        local_pay_in: 1000,
        local_currency: "NGN",
      },
      nowMs: Date.parse("2026-01-01T00:01:00.000Z"),
    })
    expect(steps[0]?.showPaymentDetailsLink).toBe(true)
  })
})
