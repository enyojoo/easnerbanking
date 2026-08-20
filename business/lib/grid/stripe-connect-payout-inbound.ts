/** Grid ACH originators we have seen on Stripe Connect payouts to merchant VAs. */
const CONNECT_HOLDERS = new Set(["easner"])
const CONNECT_ROUTINGS = new Set(["091000019"])

/** Stripe Dashboard / platform payouts – never match Connect Incoming. */
const DASHBOARD_HOLDERS = new Set(["bridge building"])
const DASHBOARD_ROUTINGS = new Set(["101019644"])

export type GridPayoutInboundKind = "connect" | "dashboard" | "other"

function webhookData(eventOrData: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!eventOrData) return undefined
  if (eventOrData.data && typeof eventOrData.data === "object") {
    return eventOrData.data as Record<string, unknown>
  }
  return eventOrData
}

function sourceOf(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const source = data?.source
  return source && typeof source === "object" ? (source as Record<string, unknown>) : undefined
}

function normalizeHolder(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function routingOf(source: Record<string, unknown> | undefined): string {
  return String(source?.bankIdentifier ?? source?.routingNumber ?? source?.routing_number ?? "")
    .replace(/\D/g, "")
}

export function classifyGridPayoutInbound(eventOrData: Record<string, unknown> | undefined): GridPayoutInboundKind {
  const data = webhookData(eventOrData)
  const source = sourceOf(data)
  const holder = normalizeHolder(source?.accountHolderName ?? source?.account_holder_name)
  const routing = routingOf(source)

  if (DASHBOARD_HOLDERS.has(holder) || DASHBOARD_ROUTINGS.has(routing)) return "dashboard"
  if (CONNECT_HOLDERS.has(holder) || CONNECT_ROUTINGS.has(routing)) return "connect"
  return "other"
}

export function isStripeConnectPayoutInbound(eventOrData: Record<string, unknown> | undefined): boolean {
  return classifyGridPayoutInbound(eventOrData) === "connect"
}
