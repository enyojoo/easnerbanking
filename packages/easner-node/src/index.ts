/**
 * @easner/node – server-side SDK for the Easner Checkout API.
 *
 * ```ts
 * import { EasnerClient } from "@easner/node"
 *
 * const easner = new EasnerClient(process.env.EASNER_SECRET_KEY!)
 * const session = await easner.checkout.sessions.create(
 *   { amount: 4900, currency: "USD", line_items: [{ name: "Pro plan", amount: 4900 }] },
 *   { idempotencyKey: "order-42" },
 * )
 * // session.client_secret → EasnerCheckout.mount(...) in the browser
 * ```
 *
 * Webhooks:
 * ```ts
 * import { constructWebhookEvent } from "@easner/node"
 * const event = constructWebhookEvent(rawBody, req.headers["easner-signature"], webhookSecret)
 * if (event.type === "checkout.completed") fulfil(event.data)
 * ```
 */

import { createHmac, timingSafeEqual } from "node:crypto"

const DEFAULT_BASE_URL = "https://api.easner.com"

export type CheckoutSessionCreateParams = {
  mode?: "payment" | "subscription"
  /** Total in the smallest currency unit (cents). Optional when line_items carry the total. */
  amount?: number
  currency?: "USD" | "EUR" | "GBP"
  line_items?: Array<{
    name: string
    /** Unit amount in cents. */
    amount: number
    quantity?: number
    description?: string
  }>
  customer_email?: string
  customer_name?: string
  /** Subscriptions only. */
  interval?: "month" | "year"
  success_url?: string
  cancel_url?: string
  metadata?: Record<string, string>
}

export type CheckoutSession = {
  client_secret: string | null
  checkout_session_id: string
  amount: number
  currency: string
  mode: "payment" | "subscription"
  customer_email: string | null
  customer_name: string | null
  livemode: boolean
  idempotent_replay?: boolean
}

export type CheckoutSessionStatus = {
  checkout_session_id: string
  status: string
  amount: number
  currency: string
  customer_email: string | null
  customer_name: string | null
  completed_at: string | null
  mode: "payment" | "subscription"
  livemode: boolean
}

export class EasnerApiError extends Error {
  readonly status: number
  readonly code: string
  readonly type: string

  constructor(status: number, body: { error?: string; code?: string; type?: string }) {
    super(body.error || `Easner API error (HTTP ${status})`)
    this.name = "EasnerApiError"
    this.status = status
    this.code = body.code ?? "unknown"
    this.type = body.type ?? "api_error"
  }
}

export type EasnerClientOptions = {
  /** Override for testing or staging. Defaults to https://api.easner.com. */
  baseUrl?: string
  fetch?: typeof fetch
}

export class EasnerClient {
  private readonly secretKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(secretKey: string, options?: EasnerClientOptions) {
    if (!secretKey || !secretKey.startsWith("easner_sk_")) {
      throw new Error("EasnerClient requires your easner_sk_… secret key")
    }
    this.secretKey = secretKey
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")
    this.fetchImpl = options?.fetch ?? fetch
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      throw new EasnerApiError(response.status, payload)
    }
    return payload as T
  }

  readonly checkout = {
    sessions: {
      /**
       * Create a checkout session. Pass `idempotencyKey` to make retries safe –
       * the same key returns the session created by the first call.
       */
      create: (
        params: CheckoutSessionCreateParams,
        options?: { idempotencyKey?: string },
      ): Promise<CheckoutSession> =>
        this.request<CheckoutSession>(
          "POST",
          "/v1/checkout/sessions",
          params,
          options?.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : undefined,
        ),

      /** Session status for order/thank-you pages. */
      retrieve: (checkoutSessionId: string): Promise<CheckoutSessionStatus> =>
        this.request<CheckoutSessionStatus>(
          "GET",
          `/v1/checkout/sessions?id=${encodeURIComponent(checkoutSessionId)}`,
        ),
    },
  }
}

export type EasnerWebhookEvent = {
  type: string
  created: number
  data: Record<string, unknown>
}

const DEFAULT_TOLERANCE_SECONDS = 300

/**
 * Verify an `Easner-Signature: t=<unix>,v1=<hex>` header against the raw request
 * body. Returns false on any mismatch, malformed header, or stale timestamp.
 */
export function verifyWebhookSignature(input: {
  payload: string
  signatureHeader: string | null | undefined
  secret: string
  /** Maximum accepted age of the signature in seconds (default 300). */
  toleranceSeconds?: number
  /** Test hook. */
  nowSeconds?: number
}): boolean {
  const header = String(input.signatureHeader ?? "")
  const parts = new Map(
    header
      .split(",")
      .map((part) => part.trim().split("=") as [string, string])
      .filter((pair) => pair.length === 2 && pair[0] && pair[1]),
  )
  const timestamp = Number(parts.get("t"))
  const signature = parts.get("v1") ?? ""
  if (!Number.isFinite(timestamp) || !signature) return false

  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > tolerance) return false

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.payload}`, "utf8")
    .digest("hex")
  const expectedBuffer = Buffer.from(expected, "utf8")
  const actualBuffer = Buffer.from(signature, "utf8")
  if (expectedBuffer.length !== actualBuffer.length) return false
  return timingSafeEqual(expectedBuffer, actualBuffer)
}

/**
 * Verify and parse a webhook request in one call. Throws when the signature is
 * invalid – respond 400 and let Easner retry.
 */
export function constructWebhookEvent(
  payload: string,
  signatureHeader: string | null | undefined,
  secret: string,
  options?: { toleranceSeconds?: number; nowSeconds?: number },
): EasnerWebhookEvent {
  const valid = verifyWebhookSignature({
    payload,
    signatureHeader,
    secret,
    toleranceSeconds: options?.toleranceSeconds,
    nowSeconds: options?.nowSeconds,
  })
  if (!valid) {
    throw new Error("Easner webhook signature verification failed")
  }
  const parsed = JSON.parse(payload) as EasnerWebhookEvent
  if (!parsed || typeof parsed.type !== "string") {
    throw new Error("Easner webhook payload is not a valid event")
  }
  return parsed
}
