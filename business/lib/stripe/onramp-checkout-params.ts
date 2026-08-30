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

export function withStripeOnrampClientContext(
  request: Request,
  body: Record<string, unknown>,
  params: Record<string, unknown>,
): Record<string, unknown> | { error: string; code: string } {
  const client = resolveStripeOnrampCustomerIpContext(request, body)
  if ("error" in client) return client
  return { ...params, ...client }
}

/**
 * Embedded Components v2 checkout only accepts optional mandate_data (ACH).
 * payment_token and customer_ip_address belong on session create.
 */
export function buildStripeOnrampCheckoutParams(body: Record<string, unknown>): Record<string, unknown> {
  const mandateData = body.mandateData ?? body.mandate_data
  if (mandateData && typeof mandateData === "object") {
    return { mandate_data: mandateData }
  }
  return {}
}
