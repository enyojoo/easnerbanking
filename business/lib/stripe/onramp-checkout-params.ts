import { resolveStripeOnrampCustomerIp } from "@/lib/stripe/request-client-ip"

export type StripeOnrampClientContext =
  | { customer_ip_address: string; user_agent?: string }
  | { error: string; code: string }

/** IP + user agent required by Stripe on onramp session create and checkout. */
export function resolveStripeOnrampClientContext(
  request: Request,
  body: Record<string, unknown>,
): StripeOnrampClientContext {
  const customerIpAddress = resolveStripeOnrampCustomerIp(request, body)
  if (!customerIpAddress) {
    return {
      error: "Could not determine client IP for payment.",
      code: "customer_ip_required",
    }
  }

  const userAgent =
    String(body.userAgent ?? body.user_agent ?? "").trim() ||
    request.headers.get("user-agent")?.trim() ||
    undefined

  return {
    customer_ip_address: customerIpAddress,
    user_agent: userAgent,
  }
}

export function withStripeOnrampClientContext(
  request: Request,
  body: Record<string, unknown>,
  params: Record<string, unknown>,
): Record<string, unknown> | { error: string; code: string } {
  const client = resolveStripeOnrampClientContext(request, body)
  if ("error" in client) return client
  return { ...params, ...client }
}

export function buildStripeOnrampCheckoutParams(
  request: Request,
  body: Record<string, unknown>,
): Record<string, unknown> | { error: string; code: string } {
  const client = resolveStripeOnrampClientContext(request, body)
  if ("error" in client) return client
  return {
    payment_token: body.paymentTokenId || undefined,
    mandate_data: body.mandateData || undefined,
    ...client,
  }
}
