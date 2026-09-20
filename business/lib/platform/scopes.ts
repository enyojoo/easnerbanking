export const PLATFORM_KEY_SCOPES = [
  "checkout",
  "accounts.read",
  "accounts.write",
  "transfers.write",
] as const

export type PlatformKeyScope = (typeof PLATFORM_KEY_SCOPES)[number]

export const DEFAULT_WEBHOOK_EVENTS = [
  "checkout.completed",
  "checkout.async_succeeded",
  "checkout.failed",
  "payment.available",
  "subscription.updated",
  "subscription.canceled",
] as const
