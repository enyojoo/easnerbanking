import { getStripeSecretKey } from "./config"
import {
  getStripeLinkDataSharingMerchant,
  getStripeLinkOAuthClientId,
  getStripeLinkOAuthScopes,
  getStripeOnrampBetaVersion,
} from "./onramp-config"

export class StripeOnrampApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "StripeOnrampApiError"
    this.status = status
    this.code = readErrorCode(body)
    this.body = body
  }
}

function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const err = (body as { error?: { code?: unknown; type?: unknown } }).error
  const code = err?.code ?? err?.type
  return typeof code === "string" ? code : null
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
  opts?: { oauthToken?: string; absoluteUrl?: string; json?: boolean },
): Promise<T> {
  const secret = getStripeSecretKey()
  if (!secret) throw new StripeOnrampApiError("Stripe is not configured", 503, null)

  const url = new URL(opts?.absoluteUrl || `https://api.stripe.com${path}`)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Stripe-Version": getStripeOnrampBetaVersion(),
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
    const message =
      json && typeof json === "object" && "error" in json
        ? String((json as { error?: { message?: string } }).error?.message || "Request failed")
        : "Request failed"
    throw new StripeOnrampApiError(message, res.status, json)
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
  return stripeOnrampRequest(
    "POST",
    "/v1/link_auth_intent",
    {
      email: input.email,
      oauth_scopes: getStripeLinkOAuthScopes(),
      oauth_client_id: clientId,
      ...(dataSharingMerchant ? { data_sharing_merchant: dataSharingMerchant } : {}),
    },
    { absoluteUrl: "https://login.link.com/v1/link_auth_intent", json: true, oauthToken },
  )
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
  }>("POST", `/v1/link_auth_intent/${encodeURIComponent(id)}/tokens`, undefined, {
    absoluteUrl: `https://login.link.com/v1/link_auth_intent/${encodeURIComponent(id)}/tokens`,
    json: true,
  })
  return {
    access_token: res.access_token,
    refresh_token: res.refresh?.refresh_token,
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
    stripeOnrampRequest("GET", "/v1/crypto/onramp/quotes", { ui_mode: "headless", ...params }, { oauthToken }),
  createSession: (params: Record<string, unknown>, oauthToken?: string) =>
    stripeOnrampRequest("POST", "/v1/crypto/onramp_sessions", { ui_mode: "headless", ...params }, { oauthToken }),
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
