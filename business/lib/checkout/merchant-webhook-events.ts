import { DEFAULT_WEBHOOK_EVENTS } from "@/lib/platform/scopes"

/**
 * Easner event names sent to merchants. Provider event names never leave the platform.
 * Client-safe catalog — do not import signing or delivery helpers here.
 */
export const MERCHANT_WEBHOOK_EVENTS = [
  "checkout.completed",
  "checkout.async_succeeded",
  "checkout.failed",
  "payment.available",
  "subscription.updated",
  "subscription.canceled",
  "account.updated",
  "customer.created",
  "customer.updated",
  "transfer.created",
  "transfer.completed",
  "transfer.failed",
  "transaction.created",
] as const

export type MerchantWebhookEvent = (typeof MERCHANT_WEBHOOK_EVENTS)[number]

export const MERCHANT_WEBHOOK_EVENT_DESCRIPTIONS: Record<MerchantWebhookEvent, string> = {
  "checkout.completed": "Payment succeeded – safe to fulfil the order.",
  "checkout.async_succeeded": "A delayed method (such as bank debit) finally cleared.",
  "checkout.failed": "The payment attempt failed or was abandoned.",
  "payment.available": "Funds landed in the Easner Balance and are available to use.",
  "subscription.updated": "A recurring payment renewed or its plan changed.",
  "subscription.canceled": "A recurring payment was cancelled.",
  "account.updated": "A platform account balance or status changed.",
  "customer.created": "A customer was created through the API.",
  "customer.updated": "A customer record changed.",
  "transfer.created": "A transfer was created.",
  "transfer.completed": "A transfer finished.",
  "transfer.failed": "A transfer failed.",
  "transaction.created": "A platform ledger entry was written.",
}

export function normalizeSubscribedWebhookEvents(raw: unknown): MerchantWebhookEvent[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WEBHOOK_EVENTS]
  const allowed = new Set<string>(MERCHANT_WEBHOOK_EVENTS)
  return raw.map(String).filter((event): event is MerchantWebhookEvent => allowed.has(event))
}
