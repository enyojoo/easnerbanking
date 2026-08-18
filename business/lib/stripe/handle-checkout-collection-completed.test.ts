import { beforeEach, describe, expect, it, vi } from "vitest"
import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"
import { handleStripeCheckoutCompleted } from "./handle-checkout-completed"

type LedgerCall = { metadata: Record<string, unknown>; amount: number; direction: string }

const paymentIntentsRetrieve = vi.fn()
const upsertLedgerTransaction = vi.fn(
  async (_admin: unknown, _input: LedgerCall) => ({ transactionId: "txn_1" }),
)
const dispatchMerchantWebhook = vi.fn(async () => ({ delivered: true }))
const deliverCheckoutPayerReceiptEmail = vi.fn(async () => ({ ok: true, to: "buyer@example.com" }))

vi.mock("./client", () => ({
  getStripe: () => ({ paymentIntents: { retrieve: paymentIntentsRetrieve } }),
}))
vi.mock("@/lib/ledger/transactions", () => ({
  upsertLedgerTransaction: (admin: unknown, input: LedgerCall) =>
    upsertLedgerTransaction(admin, input),
}))
vi.mock("@/lib/business/org-owner", () => ({
  resolveOrgOwnerUserId: vi.fn(async () => "user_owner"),
}))
vi.mock("@/lib/checkout/merchant-webhooks", () => ({
  dispatchMerchantWebhook: (...args: unknown[]) => {
    dispatchMerchantWebhook.apply(null, args as [])
    return Promise.resolve({ delivered: true })
  },
}))
vi.mock("@/lib/checkout/deliver-checkout-payer-receipt-email", () => ({
  deliverCheckoutPayerReceiptEmail: (...args: unknown[]) =>
    deliverCheckoutPayerReceiptEmail(...(args as Parameters<typeof deliverCheckoutPayerReceiptEmail>)),
}))
vi.mock("@/lib/invoices/mark-invoice-paid-stripe", () => ({
  markInvoicePaidStripe: vi.fn(),
}))
vi.mock("@/lib/invoices/patch-invoice-stripe-ledger-transaction-id", () => ({
  patchInvoiceStripeLedgerTransactionId: vi.fn(),
}))

const SETTLEMENT_ID = "11111111-1111-4111-8111-111111111111"
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222"
const LINK_ID = "44444444-4444-4444-8444-444444444444"

type Recorded = { table: string; op: string; payload: Record<string, unknown> }

function mockAdmin() {
  const writes: Recorded[] = []

  const admin = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "payment_links" ? { label: "Tuition", payment_count: 2 } : null,
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        writes.push({ table, op: "update", payload })
        const result = {
          data: table === "online_checkout_sessions" ? [{ id: "sess_1", payment_link_id: LINK_ID }] : null,
          error: null,
        }
        return {
          eq: () => ({
            select: async () => result,
            then: (resolve: (v: typeof result) => unknown) => resolve(result),
          }),
        }
      },
      upsert: async (payload: Record<string, unknown>) => {
        writes.push({ table, op: "upsert", payload })
        return { data: null, error: null }
      },
    }),
  }

  return { admin: admin as unknown as SupabaseClient, writes }
}

function paymentLinkSessionEvent(): Stripe.Event {
  return {
    id: "evt_link_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_intent: "pi_test_1",
        amount_total: 10_000,
        currency: "usd",
        payment_method_types: ["card"],
        customer_details: { email: "buyer@example.com", name: "Buyer" },
        metadata: {
          easner_settlement_id: SETTLEMENT_ID,
          easner_business_id: BUSINESS_ID,
          easner_checkout_source: "payment_link",
          easner_payment_link_id: LINK_ID,
          easner_fee_mode: "merchant_net",
          easner_listed_amount_cents: "10000",
          easner_stripe_connected_account_id: "acct_123",
        },
      },
    },
  } as unknown as Stripe.Event
}

describe("payment link settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_test_1",
      metadata: { easner_stripe_connected_account_id: "acct_123" },
      transfer_data: { destination: "acct_123" },
      latest_charge: {
        id: "ch_test_1",
        transfer: "tr_test_1",
        balance_transaction: { fee: 320 },
        payment_method_details: { type: "card", card: { brand: "visa", last4: "4242" } },
      },
    })
  })

  it("credits the ledger as an Online Checkout collection and notifies the merchant", async () => {
    const { admin, writes } = mockAdmin()

    const result = await handleStripeCheckoutCompleted(admin, paymentLinkSessionEvent())
    expect(result.handled).toBe(true)

    expect(upsertLedgerTransaction).toHaveBeenCalledTimes(1)
    const ledgerArgs = upsertLedgerTransaction.mock.calls[0][1]
    expect(ledgerArgs.direction).toBe("in")
    expect(ledgerArgs.amount).toBeCloseTo(96.8, 2)
    expect(ledgerArgs.metadata).toMatchObject({
      source: "checkout_stripe",
      collection_source: "payment_link",
      payment_link_id: LINK_ID,
      settlement_phase: "payment_received",
      stripe_transfer_id: "tr_test_1",
    })

    const settlement = writes.find(
      (w) => w.table === "checkout_stripe_settlements" && w.op === "upsert",
    )
    expect(settlement?.payload).toMatchObject({
      id: SETTLEMENT_ID,
      business_id: BUSINESS_ID,
      source: "payment_link",
      gross_cents: 10_000,
      fee_cents: 320,
      net_cents: 9_680,
      phase: "payment_received",
      ledger_transaction_id: "txn_1",
    })

    // Nothing should touch the invoice settlement table for a link payment.
    expect(writes.some((w) => w.table === "invoice_stripe_settlements")).toBe(false)

    expect(dispatchMerchantWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ businessId: BUSINESS_ID, event: "checkout.completed" }),
    )

    expect(deliverCheckoutPayerReceiptEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: BUSINESS_ID,
        to: "buyer@example.com",
        description: "Tuition",
        amountCents: 10_000,
      }),
    )
  })

  it("counts the payment against the link", async () => {
    const { admin, writes } = mockAdmin()
    await handleStripeCheckoutCompleted(admin, paymentLinkSessionEvent())

    const linkUpdate = writes.find((w) => w.table === "payment_links" && w.op === "update")
    expect(linkUpdate?.payload).toMatchObject({ payment_count: 3 })
  })

  it("ignores an event with no settlement id", async () => {
    const { admin } = mockAdmin()
    const event = paymentLinkSessionEvent()
    ;(event.data.object as { metadata: Record<string, string> }).metadata.easner_settlement_id = ""

    const result = await handleStripeCheckoutCompleted(admin, event)
    expect(result.handled).toBe(false)
    expect(upsertLedgerTransaction).not.toHaveBeenCalled()
  })

  it("keeps Stripe test payments off the ledger and Transactions", async () => {
    const { admin, writes } = mockAdmin()
    const event = paymentLinkSessionEvent()
    event.livemode = false

    const result = await handleStripeCheckoutCompleted(admin, event)
    expect(result.handled).toBe(true)
    expect(upsertLedgerTransaction).not.toHaveBeenCalled()
    expect(writes.some((w) => w.table === "checkout_stripe_settlements")).toBe(false)
    expect(writes.some((w) => w.table === "payment_links" && w.op === "update")).toBe(false)
    expect(dispatchMerchantWebhook).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        businessId: BUSINESS_ID,
        event: "checkout.completed",
        data: expect.objectContaining({ livemode: false }),
      }),
    )
    expect(deliverCheckoutPayerReceiptEmail).not.toHaveBeenCalled()
  })
})
