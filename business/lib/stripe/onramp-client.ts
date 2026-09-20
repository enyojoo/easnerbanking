import { getStripeSecretKey } from "./config"
import { logStripeOnrampApiError } from "./log-onramp-api-error"
import {
  getStripeLinkDataSharingMerchant,
  getStripeLinkOAuthClientId,
  getStripeLinkOAuthClientSecret,
  getStripeLinkOAuthScopes,
  getStripeOnrampBetaVersion,
  stripeOnrampQuotesPath,
} from "./onramp-config"

/**
 * Express deposits buyer-pays surcharge: session create uses destination_amount = usdCredit.
 * When Easner pay-in bps > 0, expressDepositsSessionCreateParams may add source_amount = totalToPay
 * (Stripe total + Easner leg). destination-only sessions still credit full usdCredit; Easner bps
 * defaults to 0 at launch until Stripe confirms stacked markup in sandbox.
 */

export class StripeOnrampApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly body: unknown
  readonly method?: string
  readonly path?: string
  readonly hasOAuthToken?: boolean

  constructor(
    message: string,
    status: number,
    body: unknown,
    ctx?: { method?: string; path?: string; hasOAuthToken?: boolean },
  ) {
    super(message)
    this.name = "StripeOnrampApiError"
    this.status = status
    this.code = readErrorCode(body)
    this.body = body
    this.method = ctx?.method
    this.path = ctx?.path
    this.hasOAuthToken = ctx?.hasOAuthToken
  }
}

function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const row = body as {
    error?: { code?: unknown; type?: unknown; error_code?: unknown }
    code?: unknown
    type?: unknown
  }
  const err = row.error
  const code = err?.code ?? err?.type ?? err?.error_code ?? row.code ?? row.type
  return typeof code === "string" ? code : null
}

function readErrorMessage(body: unknown, fallback = "Request failed"): string {
  if (!body || typeof body !== "object") return fallback
  const row = body as { error?: { message?: unknown }; message?: unknown }
  const message = row.error?.message ?? row.message
  return typeof message === "string" && message.trim() ? message : fallback
}

function toForm(params: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item != null && typeof item === "object") {
          parts.push(...toForm(item as Record<string, unknown>, `${name}[${i}]`))
        } else if (item != null && item !== "") {
          parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`)
        }
      })
    } else if (typeof value === "object") {
      parts.push(...toForm(value as Record<string, unknown>, name))
    } else if (typeof value === "boolean") {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value ? "true" : "false")}`)
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts
}

export async function stripeOnrampRequest<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, unknown>,
  opts?: { oauthToken?: string; absoluteUrl?: string; json?: boolean; omitStripeVersion?: boolean },
): Promise<T> {
  const secret = getStripeSecretKey()
  if (!secret) throw new StripeOnrampApiError("Stripe is not configured", 503, null)

  const url = new URL(opts?.absoluteUrl || `https://api.stripe.com${path}`)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  }
  if (!opts?.omitStripeVersion) {
    headers["Stripe-Version"] = getStripeOnrampBetaVersion()
  }
  if (opts?.oauthToken) headers["Stripe-OAuth-Token"] = opts.oauthToken

  let body: string | undefined
  if (method === "GET" && params) {
    for (const part of toForm(params)) {
      const [k, v] = part.split("=")
      if (k) url.searchParams.append(decodeURIComponent(k), decodeURIComponent(v || ""))
    }
  } else if (params && method !== "GET") {
    if (opts?.json) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(params)
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded"
      body = toForm(params).join("&")
    }
  }

  const res = await fetch(url.toString(), { method, headers, body })
  const json = (await res.json().catch(() => null)) as T | { error?: { message?: string } }
  if (!res.ok) {
    const err = new StripeOnrampApiError(readErrorMessage(json), res.status, json, {
      method,
      path: opts?.absoluteUrl ? new URL(opts.absoluteUrl).pathname : path,
      hasOAuthToken: Boolean(opts?.oauthToken),
    })
    logStripeOnrampApiError("api", err)
    throw err
  }
  return json as T
}

export async function createLinkAuthIntent(input: {
  email?: string
  oauthToken?: string
  /** When true, omit Stripe-OAuth-Token so the client can start a fresh Link consent flow. */
  forClientAuth?: boolean
}): Promise<Record<string, unknown>> {
  const clientId = getStripeLinkOAuthClientId()
  if (!clientId) {
    throw new StripeOnrampApiError("Link OAuth client is not configured", 503, null)
  }
  const dataSharingMerchant = getStripeLinkDataSharingMerchant()
  const oauthToken = input.forClientAuth ? undefined : input.oauthToken
  const baseParams = {
    email: input.email,
    oauth_scopes: getStripeLinkOAuthScopes(),
    oauth_client_id: clientId,
  }
  const withMerchant = {
    ...baseParams,
    ...(dataSharingMerchant ? { data_sharing_merchant: dataSharingMerchant } : {}),
  }
  try {
    return await stripeOnrampRequest(
      "POST",
      "/v1/link_auth_intent",
      withMerchant,
      { absoluteUrl: "https://login.link.com/v1/link_auth_intent", json: true, oauthToken, omitStripeVersion: true },
    )
  } catch (e) {
    if (
      dataSharingMerchant &&
      e instanceof StripeOnrampApiError &&
      e.status >= 400 &&
      e.status < 500
    ) {
      return stripeOnrampRequest(
        "POST",
        "/v1/link_auth_intent",
        baseParams,
        { absoluteUrl: "https://login.link.com/v1/link_auth_intent", json: true, oauthToken, omitStripeVersion: true },
      )
    }
    throw e
  }
}

/** Stripe recommends retrieving OAuth tokens server-side after Link consent. */
export async function retrieveLinkAuthTokens(authIntentId: string): Promise<{
  access_token?: string
  refresh_token?: string
}> {
  const id = String(authIntentId || "").trim()
  if (!id) throw new StripeOnrampApiError("authIntentId required", 400, null)
  const res = await stripeOnrampRequest<{
    access_token?: string
    refresh?: { refresh_token?: string }
    refresh_token?: string
  }>("POST", `/v1/link_auth_intent/${encodeURIComponent(id)}/tokens`, undefined, {
    absoluteUrl: `https://login.link.com/v1/link_auth_intent/${encodeURIComponent(id)}/tokens`,
    json: true,
    omitStripeVersion: true,
  })
  return {
    access_token: res.access_token,
    refresh_token: res.refresh?.refresh_token || res.refresh_token,
  }
}

export async function refreshLinkAccessToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token?: string
}> {
  const token = String(refreshToken || "").trim()
  if (!token) throw new StripeOnrampApiError("refresh_token required", 400, null)
  const clientId = getStripeLinkOAuthClientId()
  const clientSecret = getStripeLinkOAuthClientSecret()
  if (!clientId || !clientSecret) {
    throw new StripeOnrampApiError("Link OAuth client is not configured", 503, null)
  }
  const res = await stripeOnrampRequest<{
    access_token?: string
    refresh_token?: string
  }>(
    "POST",
    "/auth/token",
    {
      grant_type: "refresh_token",
      refresh_token: token,
      client_id: clientId,
      client_secret: clientSecret,
    },
    { absoluteUrl: "https://login.link.com/auth/token", omitStripeVersion: true },
  )
  const access = String(res.access_token || "").trim()
  if (!access) throw new StripeOnrampApiError("Could not refresh sign-in", 401, res)
  return {
    access_token: access,
    refresh_token: String(res.refresh_token || "").trim() || undefined,
  }
}

export const stripeOnramp = {
  createLinkAuthIntent,
  retrieveCustomer: (id: string, oauthToken?: string) =>
    stripeOnrampRequest("GET", `/v1/crypto/customers/${id}`, undefined, { oauthToken }),
  createCustomer: (params: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("POST", "/v1/crypto/customers", params, { oauthToken }),
  listWallets: (customerId: string, oauthToken?: string) =>
    stripeOnrampRequest("GET", `/v1/crypto/customers/${customerId}/crypto_consumer_wallets`, undefined, {
      oauthToken,
    }),
  registerWallet: (customerId: string, params: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("POST", `/v1/crypto/customers/${customerId}/crypto_consumer_wallets`, params, {
      oauthToken,
    }),
  listPaymentTokens: (customerId: string, oauthToken?: string) =>
    stripeOnrampRequest("GET", `/v1/crypto/customers/${customerId}/payment_tokens`, undefined, { oauthToken }),
  quotes: (params: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("GET", stripeOnrampQuotesPath(), { ui_mode: "headless", ...params }, { oauthToken }),
  createSession: (params: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("POST", "/v1/crypto/onramp_sessions", { ui_mode: "headless", ...params }, { oauthToken }),
  createHostedSession: (params: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("POST", "/v1/crypto/onramp_sessions", params, { oauthToken }),
  retrieveSession: (id: string, oauthToken?: string) =>
    stripeOnrampRequest("GET", `/v1/crypto/onramp_sessions/${id}`, undefined, { oauthToken }),
  quoteSession: (id: string, params?: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("POST", `/v1/crypto/onramp_sessions/${id}/quote`, params ?? {}, { oauthToken }),
  checkoutSession: (id: string, params?: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("POST", `/v1/crypto/onramp_sessions/${id}/checkout`, params ?? {}, { oauthToken }),
}

export function getStripeOnramp() {
  return stripeOnramp
}
