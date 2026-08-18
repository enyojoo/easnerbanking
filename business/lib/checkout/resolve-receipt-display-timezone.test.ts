import { afterEach, describe, expect, it, vi } from "vitest"
import {
  resetReceiptDisplayTimeZoneCacheForTests,
  resolveReceiptDisplayTimeZone,
} from "@/lib/checkout/resolve-receipt-display-timezone"

const accountsRetrieve = vi.fn()

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ accounts: { retrieve: accountsRetrieve } }),
}))

describe("resolveReceiptDisplayTimeZone", () => {
  afterEach(() => {
    delete process.env.EASNER_RECEIPT_TIMEZONE
    resetReceiptDisplayTimeZoneCacheForTests()
    vi.clearAllMocks()
  })

  it("uses EASNER_RECEIPT_TIMEZONE when set", async () => {
    process.env.EASNER_RECEIPT_TIMEZONE = "Asia/Jerusalem"
    await expect(resolveReceiptDisplayTimeZone()).resolves.toBe("Asia/Jerusalem")
    expect(accountsRetrieve).not.toHaveBeenCalled()
  })

  it("falls back to the Stripe Dashboard timezone", async () => {
    accountsRetrieve.mockResolvedValue({
      settings: { dashboard: { timezone: "America/New_York" } },
    })
    await expect(resolveReceiptDisplayTimeZone()).resolves.toBe("America/New_York")
  })
})
