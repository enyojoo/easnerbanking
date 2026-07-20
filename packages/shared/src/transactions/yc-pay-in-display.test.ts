import { describe, expect, it } from "vitest"
import {
  YC_PAY_IN_AWAITING_STATUS,
  YC_PAY_IN_AWAITING_DESCRIPTION_PREFIX,
  YC_PAY_IN_REVIEW_PAYMENT_WINDOW_EXPIRED,
  buildYcPayInLifecycle,
  formatYcPayInPaymentDeadlineLabel,
  formatYcPayInDepositTimeRemaining,
  isYcPayInAwaitingAttestation,
  ledgerTransactionStatusDisplayForRow,
  readYcPayInEffectiveProcessingAt,
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

  it("uses quote lock for user when before attestation", () => {
    expect(
      resolveYcPayInUserWhenAt({
        quote_locked_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe("2026-01-01T00:00:00.000Z")
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
    expect(steps[0]?.occurredAt).toBe("2026-01-01T00:00:00.000Z")
    expect(steps[0]?.showPaymentDetailsLink).toBe(true)
    expect(steps[0]?.description.endsWith(" ")).toBe(true)
  })

  it("marks awaiting complete at attestation and holds processing until webhook", () => {
    const steps = buildYcPayInLifecycle({
      status: "processing",
      metadata: {
        yc_mode: "fund_balance",
        quote_locked_at: "2026-01-01T00:00:00.000Z",
        payment_attested_at: "2026-01-01T00:03:00.000Z",
        local_pay_in: 1000,
        local_currency: "NGN",
      },
      crossBorder: false,
    })
    expect(steps[0]?.state).toBe("complete")
    expect(steps[0]?.occurredAt).toBe("2026-01-01T00:03:00.000Z")
    expect(steps[1]?.id).toBe("processing")
    expect(steps[1]?.title).toBe("Confirming payment")
    expect(steps[1]?.state).toBe("current")
    expect(steps[1]?.occurredAt).toBeNull()
  })

  it("uses webhook processing time on processing step after attestation", () => {
    const steps = buildYcPayInLifecycle({
      status: "processing",
      metadata: {
        yc_mode: "fund_balance",
        quote_locked_at: "2026-01-01T00:00:00.000Z",
        payment_attested_at: "2026-01-01T00:03:00.000Z",
        processing_at: "2026-01-01T00:10:00.000Z",
        local_pay_in: 1000,
        local_currency: "NGN",
      },
      crossBorder: false,
    })
    expect(steps[0]?.occurredAt).toBe("2026-01-01T00:03:00.000Z")
    expect(steps[1]?.title).toBe("Processing")
    expect(steps[1]?.occurredAt).toBe("2026-01-01T00:10:00.000Z")
  })

  it("ignores pre-attest processing_at from YC order-state webhooks", () => {
    expect(
      readYcPayInEffectiveProcessingAt({
        payment_attested_at: "2026-01-01T00:03:00.000Z",
        processing_at: "2026-01-01T00:01:00.000Z",
      }),
    ).toBeNull()

    const steps = buildYcPayInLifecycle({
      status: "processing",
      metadata: {
        yc_mode: "fund_balance",
        quote_locked_at: "2026-01-01T00:00:00.000Z",
        payment_attested_at: "2026-01-01T00:03:00.000Z",
        processing_at: "2026-01-01T00:01:00.000Z",
        local_pay_in: 1000,
        local_currency: "NGN",
      },
    })
    expect(steps[1]?.title).toBe("Confirming payment")
    expect(steps[1]?.state).toBe("current")
  })

  it("shows Awaiting payment label before attestation", () => {
    expect(
      ledgerTransactionStatusDisplayForRow("pending", { yc_mode: "fund_balance" }).label,
    ).toBe("Awaiting payment")
  })

  it("formats pay-in countdown from YC deposit expiry", () => {
    const nowMs = Date.parse("2026-07-21T10:00:00.000Z")
    const expiresAt = "2026-07-21T14:30:00.000Z"
    expect(formatYcPayInPaymentDeadlineLabel(expiresAt, { nowMs })).toBe(
      "Make payment within 4:30:00",
    )
  })

  it("formats deposit countdown as live H:MM:SS above one hour", () => {
    expect(formatYcPayInDepositTimeRemaining(3 * 60 * 60 * 1000 + 59 * 60 * 1000 + 42 * 1000)).toBe(
      "3:59:42",
    )
  })

  it("formats deposit countdown as mm:ss under one hour", () => {
    expect(formatYcPayInDepositTimeRemaining(7 * 60 * 1000 + 21 * 1000)).toBe("7:21")
  })

  it("shows review restart copy when payment window closes on Review & Complete", () => {
    expect(YC_PAY_IN_REVIEW_PAYMENT_WINDOW_EXPIRED).toBe(
      "The time to complete this payment has passed. Go back and start again.",
    )
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
