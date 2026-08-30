import { resolveStripeOnrampCustomerIp } from "@/lib/stripe/request-client-ip"

export type StripeOnrampCustomerIpContext =
  | { customer_ip_address: string }
  | { error: string; code: string }

/** IP required by Stripe on headless onramp session create. */
export function resolveStripeOnrampCustomerIpContext(
  request: Request,
  body: Record<string, unknown>,
): StripeOnrampCustomerIpContext {
  const customerIpAddress = resolveStripeOnrampCustomerIp(request, body)
  if (!customerIpAddress) {
    return {
      error: "Could not determine client IP for payment.",
      code: "customer_ip_required",
    }
  }
  return { customer_ip_address: customerIpAddress }
}

function resolveStripeOnrampUserAgent(
  request: Request,
  body: Record<string, unknown>,
): string | undefined {
  return (
    String(body.userAgent ?? body.user_agent ?? "").trim() ||
    request.headers.get("user-agent")?.trim() ||
    undefined
  )
}

export function withStripeOnrampClientContext(
  request: Request,
  body: Record<string, unknown>,
  params: Record<string, unknown>,
): Record<string, unknown> | { error: string; code: string } {
  const client = resolveStripeOnrampCustomerIpContext(request, body)
  if ("error" in client) return client
  return { ...params, ...client }
}

/** Checkout accepts customer_ip_address and user_agent; session create accepts IP only. */
export function buildStripeOnrampCheckoutParams(
  request: Request,
  body: Record<string, unknown>,
): Record<string, unknown> | { error: string; code: string } {
  const client = resolveStripeOnrampCustomerIpContext(request, body)
  if ("error" in client) return client
  return {
    payment_token: body.paymentTokenId || undefined,
    mandate_data: body.mandateData || undefined,
    ...client,
    user_agent: resolveStripeOnrampUserAgent(request, body),
  }
}
