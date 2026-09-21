export const PLATFORM_KEY_SCOPES = [
  "checkout",
  "accounts.read",
  "accounts.write",
  "transfers.write",
] as const

export type PlatformKeyScope = (typeof PLATFORM_KEY_SCOPES)[number]

export const DEFAULT_WEBHOOK_EVENTS = [
  "customer.updated",
  "account.updated",
  "transfer.completed",
  "transaction.created",
] as const
