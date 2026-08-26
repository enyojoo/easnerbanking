import {
  ANALYTICS_EVENTS,
  ANALYTICS_PLATFORM,
  ANALYTICS_SURFACE,
  checkoutAnalyticsProperties,
  type CheckoutChannel,
} from "@easner/shared"

type ServerCaptureInput = {
  event: string
  distinctId: string
  properties?: Record<string, unknown>
  businessId?: string | null
  /** PostHog dedupe key – same value within 24h collapses to one event. */
  insertId?: string | null
}

function posthogCaptureEndpoint(): { url: string; apiKey: string } | null {
  const apiKey =
    process.env.POSTHOG_SERVER_KEY?.trim() || process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || ""
  if (!apiKey) return null
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com"
  return { apiKey, url: `${host.replace(/\/$/, "")}/capture/` }
}

/** Non-blocking PostHog capture for server routes and webhooks. */
export function captureServerAnalyticsEvent(input: ServerCaptureInput): void {
  const endpoint = posthogCaptureEndpoint()
  if (!endpoint) return

  const businessId = input.businessId?.trim() || ""
  const properties: Record<string, unknown> = {
    platform: ANALYTICS_PLATFORM.businessWeb,
    environment: process.env.NODE_ENV,
    surface: ANALYTICS_SURFACE.operator,
    ...input.properties,
  }
  if (businessId) {
    properties.$groups = { company: businessId }
    properties.easner_business_id = businessId
  }
  if (input.insertId?.trim()) {
    properties.$insert_id = input.insertId.trim()
  }

  void fetch(endpoint.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: endpoint.apiKey,
      event: input.event,
      distinct_id: input.distinctId,
      properties,
    }),
  }).catch(() => {
    /* analytics must never block checkout */
  })
}

function merchantDistinctId(businessId: string): string {
  return `business:${businessId}`
}

function payerDistinctId(settlementId: string): string {
  return `checkout:${settlementId}`
}

export function trackServerCheckoutStarted(input: {
  channel: CheckoutChannel
  businessId: string
  settlementId: string
  currency: string
  amountCents: number
  paymentLinkId?: string | null
  invoiceId?: string | null
  livemode?: boolean
}): void {
  captureServerAnalyticsEvent({
    event: ANALYTICS_EVENTS.checkoutStarted,
    distinctId: merchantDistinctId(input.businessId),
    businessId: input.businessId,
    insertId: `checkout_started:${input.settlementId}`,
    properties: checkoutAnalyticsProperties(input),
  })
}

export function trackServerCheckoutCompleted(input: {
  channel: CheckoutChannel
  businessId: string
  settlementId: string
  currency: string
  amountCents: number
  paymentLinkId?: string | null
  invoiceId?: string | null
  livemode?: boolean
  stripeEventId?: string | null
}): void {
  captureServerAnalyticsEvent({
    event: ANALYTICS_EVENTS.checkoutCompleted,
    distinctId: merchantDistinctId(input.businessId),
    businessId: input.businessId,
    insertId: input.stripeEventId
      ? `checkout_completed:${input.stripeEventId}`
      : `checkout_completed:${input.settlementId}`,
    properties: checkoutAnalyticsProperties({ ...input, rail: "card_bank" }),
  })
}

export function trackServerInvoicePaid(input: {
  businessId: string
  settlementId: string
  invoiceId: string
  currency: string
  amountCents: number
  livemode?: boolean
  stripeEventId?: string | null
}): void {
  captureServerAnalyticsEvent({
    event: ANALYTICS_EVENTS.invoicePaid,
    distinctId: merchantDistinctId(input.businessId),
    businessId: input.businessId,
    insertId: input.stripeEventId
      ? `invoice_paid:${input.stripeEventId}`
      : `invoice_paid:${input.settlementId}`,
    properties: checkoutAnalyticsProperties({
      channel: "invoice",
      businessId: input.businessId,
      settlementId: input.settlementId,
      currency: input.currency,
      amountCents: input.amountCents,
      invoiceId: input.invoiceId,
      livemode: input.livemode,
      rail: "card_bank",
    }),
  })
}

/** Embed checkout has no client PostHog – payer success/fail is server-only. */
export function trackServerEmbedPayerPaymentSucceeded(input: {
  businessId: string
  settlementId: string
  channel: Extract<CheckoutChannel, "embed" | "payment_link">
  currency: string
  amountCents: number
  paymentLinkId?: string | null
  livemode?: boolean
  stripeEventId?: string | null
}): void {
  if (input.channel !== "embed") return
  captureServerAnalyticsEvent({
    event: ANALYTICS_EVENTS.payerPaymentSucceeded,
    distinctId: payerDistinctId(input.settlementId),
    businessId: input.businessId,
    insertId: input.stripeEventId
      ? `payer_payment_succeeded:${input.stripeEventId}`
      : `payer_payment_succeeded:${input.settlementId}`,
    properties: {
      platform: ANALYTICS_PLATFORM.payerWeb,
      surface: ANALYTICS_SURFACE.payer,
      ...checkoutAnalyticsProperties({ ...input, rail: "card_bank" }),
    },
  })
}

export function trackServerEmbedPayerPaymentFailed(input: {
  businessId: string
  settlementId: string
  channel: Extract<CheckoutChannel, "embed" | "payment_link">
  currency: string
  amountCents: number
  paymentLinkId?: string | null
  reason?: string | null
  livemode?: boolean
  stripeEventId?: string | null
}): void {
  if (input.channel !== "embed") return
  captureServerAnalyticsEvent({
    event: ANALYTICS_EVENTS.payerPaymentFailed,
    distinctId: payerDistinctId(input.settlementId),
    businessId: input.businessId,
    insertId: input.stripeEventId
      ? `payer_payment_failed:${input.stripeEventId}`
      : `payer_payment_failed:${input.settlementId}`,
    properties: {
      platform: ANALYTICS_PLATFORM.payerWeb,
      surface: ANALYTICS_SURFACE.payer,
      ...(input.reason ? { error: input.reason } : {}),
      ...checkoutAnalyticsProperties({ ...input, rail: "card_bank" }),
    },
  })
}
