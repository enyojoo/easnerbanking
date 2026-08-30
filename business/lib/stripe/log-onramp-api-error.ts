import { NextResponse } from "next/server"
import { StripeOnrampApiError } from "@/lib/stripe/onramp-client"

/** Structured Vercel log line for Express deposits / Stripe crypto API failures (search: `express_onramp`). */
export function logStripeOnrampApiError(
  stage: string,
  e: unknown,
  meta?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = { stage, ...meta }

  if (e instanceof StripeOnrampApiError) {
    let stripeBodyJson: string | null = null
    try {
      stripeBodyJson = e.body == null ? null : JSON.stringify(e.body)
    } catch {
      stripeBodyJson = null
    }
    console.error("[express_onramp]", {
      ...payload,
      provider: "stripe_crypto",
      httpStatus: e.status,
      stripeCode: e.code,
      stripeMessage: e.message,
      stripeMethod: e.method ?? null,
      stripePath: e.path ?? null,
      hasOAuthToken: e.hasOAuthToken ?? null,
      stripeBody: e.body ?? null,
      stripeBodyJson,
    })
    return
  }

  console.error("[express_onramp]", {
    ...payload,
    error: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  })
}

/** Route-level context line; API details are logged once in onramp-client. */
export function logStripeOnrampRouteContext(
  stage: string,
  e: unknown,
  meta?: Record<string, unknown>,
): void {
  if (e instanceof StripeOnrampApiError) {
    console.error("[express_onramp]", {
      stage,
      ...meta,
      httpStatus: e.status,
      stripeCode: e.code,
      stripeMessage: e.message,
      stripeMethod: e.method ?? null,
      stripePath: e.path ?? null,
    })
    return
  }

  logStripeOnrampApiError(stage, e, meta)
}

/** Log route context and return a JSON error response for onramp API routes. */
export function mapStripeOnrampRouteError(
  route: string,
  e: unknown,
  meta?: Record<string, unknown>,
): NextResponse {
  logStripeOnrampRouteContext(`route:${route}`, e, meta)
  if (e instanceof StripeOnrampApiError) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status >= 400 ? e.status : 400 },
    )
  }

  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Request failed" },
    { status: 400 },
  )
}
