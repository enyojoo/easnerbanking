import type { MerchantWebhookEvent } from "./merchant-webhook-events"

/**
 * Hand-authored sample payloads for the Console "send test event" simulator —
 * shaped like the real public objects (id prefixes, field names) but static,
 * not derived from live data. Lets a developer see any event's shape without
 * driving a real customer/transfer/checkout flow through `/v1` first.
 */
export function buildSampleWebhookPayload(event: MerchantWebhookEvent): Record<string, unknown> {
  const now = new Date().toISOString()
  switch (event) {
    case "checkout.completed":
    case "checkout.async_succeeded":
    case "checkout.failed":
      return {
        test: true,
        checkout_session_id: "cs_test_easner_sample",
        mode: "payment",
        amount_cents: 4900,
        currency: "USD",
        customer_email: "customer@example.com",
        subscription_id: null,
        metadata: { order_id: "ord_test" },
        paid_at: event === "checkout.failed" ? null : now,
        livemode: false,
      }
    case "payment.available":
      return { test: true, amount_cents: 4900, currency: "USD", available_at: now, livemode: false }
    case "subscription.updated":
    case "subscription.canceled":
      return {
        test: true,
        subscription_id: "sub_test_easner_sample",
        status: event === "subscription.canceled" ? "canceled" : "active",
        current_period_end: now,
        livemode: false,
      }
    case "account.updated":
      return {
        test: true,
        id: "acct_test_easner_sample",
        currency: "USD",
        available: 12500,
        livemode: false,
      }
    case "customer.created":
    case "customer.updated":
      return {
        test: true,
        id: "cus_test_easner_sample",
        email: "customer@example.com",
        name: "Sample Customer",
        status: "active",
        livemode: false,
      }
    case "transfer.created":
    case "transfer.completed":
    case "transfer.failed":
      return {
        test: true,
        id: "tr_test_easner_sample",
        status: event === "transfer.completed" ? "completed" : event === "transfer.failed" ? "failed" : "pending",
        amount_cents: 2500,
        currency: "USD",
        livemode: false,
      }
    case "transaction.created":
      return {
        test: true,
        id: "txn_test_easner_sample",
        type: "transfer",
        amount_cents: 2500,
        currency: "USD",
        direction: "out",
        livemode: false,
      }
    default:
      return { test: true, livemode: false }
  }
}
