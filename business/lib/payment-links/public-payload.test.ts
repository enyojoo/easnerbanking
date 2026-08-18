import { describe, expect, it, vi, beforeEach } from "vitest"
import { buildPublicPaymentLinkPayload } from "./public-payload"

vi.mock("@/lib/compliance/business-tier1", () => ({
  isBusinessTier1Complete: vi.fn(() => true),
}))

vi.mock("@/lib/stripe/config", () => ({
  isOnlineCheckoutEnabled: vi.fn(() => true),
}))

vi.mock("@/lib/stripe/connect", () => ({
  resolveConnectReadyForCheckout: vi.fn(),
}))

vi.mock("@/lib/stripe/resolve-online-payments-enabled", () => ({
  resolveOnlinePaymentsEnabled: vi.fn(),
}))

vi.mock("@/lib/stripe/checkout-fee-mode", () => ({
  resolveCheckoutFeeMode: vi.fn(async () => ({ feeMode: "merchant_net" })),
}))

vi.mock("@/lib/stripe/application-fee", () => ({
  computeCheckoutAmounts: vi.fn(({ listedAmountCents }) => ({
    customerAmountCents: listedAmountCents,
    surchargeCents: 0,
  })),
}))

import { resolveConnectReadyForCheckout } from "@/lib/stripe/connect"
import { resolveOnlinePaymentsEnabled } from "@/lib/stripe/resolve-online-payments-enabled"

const connectMock = vi.mocked(resolveConnectReadyForCheckout)
const masterMock = vi.mocked(resolveOnlinePaymentsEnabled)

function adminStub() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { name: "Acme", logo_url: null, easetag: null },
          }),
        }),
      }),
    }),
  } as never
}

const linkRow = {
  id: "link-1",
  business_id: "biz-1",
  public_id: "plink_abc",
  title: "Test",
  amount_cents: 1000,
  currency: "USD",
  rail: "card_bank",
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

beforeEach(() => {
  vi.clearAllMocks()
  connectMock.mockResolvedValue({
    ready: true,
    stripeAccountId: "acct_1",
  } as never)
})

describe("buildPublicPaymentLinkPayload onlinePaymentsEnabled", () => {
  it("is false when master switch is off even if connect is ready", async () => {
    masterMock.mockResolvedValue({ enabled: false })
    const payload = await buildPublicPaymentLinkPayload(adminStub(), linkRow as never)
    expect(payload.onlinePaymentsEnabled).toBe(false)
  })

  it("is true when master switch and connect are ready", async () => {
    masterMock.mockResolvedValue({ enabled: true })
    const payload = await buildPublicPaymentLinkPayload(adminStub(), linkRow as never)
    expect(payload.onlinePaymentsEnabled).toBe(true)
  })
})
