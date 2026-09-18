import { beforeEach, describe, expect, it, vi } from "vitest"

const sessionsCreate = vi.fn()
const loadStripeMock = vi.fn()
const refundsCreate = vi.fn()

vi.mock("server-only", () => ({}))

vi.mock("@/lib/compliance/business-tier1", () => ({
  isBusinessTier1Complete: vi.fn(() => true),
}))

vi.mock("./resolve-online-payments-enabled", () => ({
  resolveOnlinePaymentsEnabled: vi.fn(async () => ({ enabled: true })),
}))

vi.mock("./connect", () => ({
  resolveConnectReadyForCheckout: vi.fn(async () => ({
    ready: true,
    stripeAccountId: "acct_live",
    reason: undefined,
  })),
}))

vi.mock("./connect/create-connected-account", () => ({
  ensureTestConnectedAccount: vi.fn(),
}))

vi.mock("./connect/payment-method-domains", () => ({
  ensureConnectedPaymentMethodDomains: vi.fn(async () => undefined),
}))

vi.mock("./checkout-fee-mode", () => ({
  resolveCheckoutFeeMode: vi.fn(async () => ({ feeMode: "merchant_net" })),
}))

vi.mock("./config", () => ({
  isStripeInvoicePaymentsEnabled: () => true,
  isOnlineCheckoutEnabled: () => true,
  isStripeTestPaymentsConfigured: () => true,
  getStripePublishableKey: () => "pk_test_123",
  getStripePlatformFeeBps: () => 0,
}))

vi.mock("@/lib/server-analytics", () => ({
  trackServerCheckoutStarted: vi.fn(),
}))

vi.mock("./client", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreate, retrieve: vi.fn() } },
    refunds: { create: refundsCreate },
  }),
}))

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: (...args: unknown[]) => loadStripeMock(...args),
}))

vi.mock("@/lib/stripe/elements-appearance", () => ({
  browserStripeLocale: () => "en",
}))

import { createOnlineCheckoutSession } from "./create-online-checkout-session"
import { createStripeDestinationRefund } from "./create-destination-refund"
import { getStripeJs, __resetStripeJsCacheForTests } from "./load-stripe-js"

function checkoutAdmin() {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data:
            table === "businesses"
              ? { name: "Acme", verification_status: "approved" }
              : table === "online_checkout_sessions"
                ? null
                : null,
        }),
        insert: () => builder,
        update: () => builder,
        single: async () => ({ data: { id: "ocs_1" }, error: null }),
      }
      return builder
    },
  } as never
}

describe("createOnlineCheckoutSession Direct Charges", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionsCreate.mockResolvedValue({
      id: "cs_test_1",
      client_secret: "cs_test_1_secret",
      payment_intent: "pi_1",
    })
  })

  it("creates the session on the connected account without transfer_data", async () => {
    const result = await createOnlineCheckoutSession(checkoutAdmin(), {
      source: "invoice",
      businessId: "biz_1",
      mode: "payment",
      listedAmountCents: 10_000,
      currency: "USD",
      productName: "Invoice",
      returnUrl: "https://invoice.easner.com/pay",
      invoiceId: "inv_1",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.stripeAccountId).toBe("acct_live")
    expect(sessionsCreate).toHaveBeenCalledTimes(1)
    const [params, options] = sessionsCreate.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(options).toEqual(expect.objectContaining({ stripeAccount: "acct_live" }))
    const pi = params.payment_intent_data as Record<string, unknown>
    expect(pi).toBeTruthy()
    expect(pi.transfer_data).toBeUndefined()
    expect(typeof pi.application_fee_amount).toBe("number")
  })
})

describe("createStripeDestinationRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    refundsCreate.mockResolvedValue({ id: "re_1", status: "succeeded" })
  })

  it("refunds on the connected account without reverse_transfer", async () => {
    const result = await createStripeDestinationRefund({
      paymentIntentId: "pi_1",
      businessId: "biz_1",
      settlementId: "set_1",
      stripeAccountId: "acct_live",
      idempotencyKey: "refund_1",
    })
    expect(result).toEqual({ ok: true, refundId: "re_1", status: "succeeded" })
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_1",
      }),
      expect.objectContaining({ stripeAccount: "acct_live" }),
    )
    const body = refundsCreate.mock.calls[0][0] as Record<string, unknown>
    expect(body.reverse_transfer).toBeUndefined()
  })
})

describe("getStripeJs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetStripeJsCacheForTests()
    loadStripeMock.mockResolvedValue({})
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_abc"
  })

  it("loads Stripe.js with stripeAccount for Direct Charges", async () => {
    await getStripeJs("acct_live")
    expect(loadStripeMock).toHaveBeenCalledWith(
      "pk_test_abc",
      expect.objectContaining({ stripeAccount: "acct_live" }),
    )
  })
})
