import { describe, expect, it } from "vitest"
import {
  YC_EXPIRED_PAY_IN_RECONCILE_POLLED_AT,
  shouldReconcileExpiredYcPayInOnDetail,
} from "./reconcile-expired-yc-pay-in"

describe("shouldReconcileExpiredYcPayInOnDetail", () => {
  const baseMeta = {
    yc_mode: "fund_balance",
    quote_expires_at: "2026-01-01T00:05:00.000Z",
    local_pay_in: 1000,
    local_currency: "NGN",
  }

  it("returns true when deposit window closed and still awaiting attestation", () => {
    expect(
      shouldReconcileExpiredYcPayInOnDetail(baseMeta, "pending", Date.parse("2026-01-01T00:10:00.000Z")),
    ).toBe(true)
  })

  it("returns false while deposit window is still open", () => {
    expect(
      shouldReconcileExpiredYcPayInOnDetail(baseMeta, "pending", Date.parse("2026-01-01T00:04:00.000Z")),
    ).toBe(false)
  })

  it("returns false after one reconcile attempt was recorded", () => {
    expect(
      shouldReconcileExpiredYcPayInOnDetail(
        { ...baseMeta, [YC_EXPIRED_PAY_IN_RECONCILE_POLLED_AT]: "2026-01-01T00:10:00.000Z" },
        "pending",
        Date.parse("2026-01-01T00:11:00.000Z"),
      ),
    ).toBe(false)
  })

  it("returns true when attested but deposit window closed and ledger still pending", () => {
    expect(
      shouldReconcileExpiredYcPayInOnDetail(
        { ...baseMeta, payment_attested_at: "2026-01-01T00:06:00.000Z" },
        "pending",
        Date.parse("2026-01-01T00:10:00.000Z"),
      ),
    ).toBe(true)
  })

  it("returns false when ledger is already terminal", () => {
    expect(
      shouldReconcileExpiredYcPayInOnDetail(
        { ...baseMeta, payment_attested_at: "2026-01-01T00:06:00.000Z" },
        "failed",
        Date.parse("2026-01-01T00:10:00.000Z"),
      ),
    ).toBe(false)
  })
})
