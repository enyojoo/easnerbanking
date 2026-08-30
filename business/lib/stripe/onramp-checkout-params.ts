import { resolveStripeOnrampCustomerIp } from "@/lib/stripe/request-client-ip"

export function buildStripeOnrampCheckoutParams(
  request: Request,
  body: Record<string, unknown>,
): Record<string, unknown> | { error: string; code: string } {
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
    payment_token: body.paymentTokenId || undefined,
    mandate_data: body.mandateData || undefined,
    customer_ip_address: customerIpAddress,
    user_agent: userAgent,
  }
}
