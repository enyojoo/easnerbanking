const IP_V4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/
const IP_V6 = /^[\da-f:]+$/i

function normalizeIp(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim()
  if (!value) return null
  if (IP_V4.test(value)) return value
  if (value.includes(":") && IP_V6.test(value)) return value
  return null
}

function ipFromForwardedHeader(raw: string | null | undefined): string | null {
  if (!raw) return null
  return normalizeIp(raw.split(",")[0]?.trim())
}

/** Best-effort client IP for Stripe onramp checkout / mandates. */
export function resolveRequestClientIp(
  request: Request,
  body?: Record<string, unknown> | null,
): string | null {
  const fromBody = normalizeIp(
    String(body?.customerIpAddress ?? body?.customer_ip_address ?? "").trim() || null,
  )
  if (fromBody) return fromBody

  const headerCandidates = [
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("true-client-ip"),
    request.headers.get("x-vercel-forwarded-for"),
  ]

  for (const candidate of headerCandidates) {
    const ip = candidate?.includes(",")
      ? ipFromForwardedHeader(candidate)
      : normalizeIp(candidate)
    if (ip) return ip
  }

  return null
}

/** Stripe requires customer_ip_address on onramp session create and checkout; allow local dev fallback. */
export function resolveStripeOnrampCustomerIp(
  request: Request,
  body?: Record<string, unknown> | null,
): string | null {
  const ip = resolveRequestClientIp(request, body)
  if (ip) return ip
  if (process.env.NODE_ENV === "development") return "127.0.0.1"
  return null
}
