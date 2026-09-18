/** ACH originators we have seen on Stripe Connect payouts to merchant VAs. */
const CONNECT_HOLDERS = new Set(["easner"])
const CONNECT_ROUTINGS = new Set(["091000019"])

/** Stripe Dashboard / platform payouts – never match Connect Incoming. */
const DASHBOARD_HOLDERS = new Set(["bridge building"])
const DASHBOARD_ROUTINGS = new Set(["101019644"])

export type ConnectPayoutInboundKind = "connect" | "dashboard" | "other"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function webhookData(eventOrData: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!eventOrData) return undefined
  const nested = asRecord(eventOrData.event_object) ?? asRecord(eventOrData.data)
  if (nested) return nested
  return eventOrData
}

function sourceOf(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const source = asRecord(data?.source) ?? asRecord(data?.originator)
  return source ?? data
}

function normalizeHolder(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function routingOf(source: Record<string, unknown> | undefined): string {
  if (!source) return ""
  return String(
    source.bankIdentifier ??
      source.routingNumber ??
      source.routing_number ??
      source.bank_routing_number ??
      source.aba ??
      "",
  ).replace(/\D/g, "")
}

function holderOf(
  source: Record<string, unknown> | undefined,
  data: Record<string, unknown> | undefined,
): string {
  return normalizeHolder(
    source?.accountHolderName ??
      source?.account_holder_name ??
      source?.sender_name ??
      source?.originator_name ??
      source?.name ??
      data?.sender_name ??
      data?.accountHolderName ??
      data?.account_holder_name,
  )
}

export function classifyConnectPayoutInbound(
  eventOrData: Record<string, unknown> | undefined,
): ConnectPayoutInboundKind {
  const data = webhookData(eventOrData)
  const source = sourceOf(data)
  const holder = holderOf(source, data)
  const routing = routingOf(source)

  if (DASHBOARD_HOLDERS.has(holder) || DASHBOARD_ROUTINGS.has(routing)) return "dashboard"
  if (CONNECT_HOLDERS.has(holder) || CONNECT_ROUTINGS.has(routing)) return "connect"
  return "other"
}

export function isStripeConnectPayoutInbound(eventOrData: Record<string, unknown> | undefined): boolean {
  return classifyConnectPayoutInbound(eventOrData) === "connect"
}
