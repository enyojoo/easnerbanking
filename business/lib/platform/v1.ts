import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { assertAccountAllows } from "@/lib/account-restriction"
import { consumeApiRateLimit, isV1WriteScope, v1BusinessWriteLimit } from "@/lib/api/rate-limit"
import {
  authenticateMerchantKey,
  requireScope,
  type MerchantKeyContext,
} from "@/lib/checkout/authenticate-merchant-key"
import { checkoutApiError } from "@/lib/checkout/checkout-api-error"

export type TimedMerchantContext = MerchantKeyContext & { startedAt: number; idempotencyKey: string | null }

export function v1Error(status: number, code: string, message: string) {
  const { body } = checkoutApiError(status, code, message)
  const response = NextResponse.json(body, { status })
  if (status === 429) response.headers.set("Retry-After", "60")
  return response
}

export async function requireMerchant(
  admin: SupabaseClient,
  request: Request,
  scope: string,
): Promise<{ ok: true; ctx: TimedMerchantContext } | { ok: false; response: NextResponse }> {
  const startedAt = Date.now()
  const auth = await authenticateMerchantKey(admin, request.headers.get("authorization"))
  if (!auth.ok) {
    return {
      ok: false,
      response: v1Error(auth.status, auth.status === 403 ? "key_forbidden" : "invalid_api_key", auth.error),
    }
  }
  const scoped = requireScope(auth.ctx, scope)
  if (!scoped.ok) {
    return { ok: false, response: v1Error(scoped.status, "key_forbidden", scoped.error) }
  }
  const write = isV1WriteScope(scope)
  if (write) {
    const allowed = await consumeApiRateLimit(admin, `v1:write:${auth.ctx.businessId}`, {
      limit: v1BusinessWriteLimit(),
      windowSeconds: 60,
    })
    if (!allowed) {
      return { ok: false, response: v1Error(429, "rate_limit", "Too many requests") }
    }
  }
  return { ok: true, ctx: { ...auth.ctx, startedAt, idempotencyKey: readIdempotencyKey(request) } }
}

export async function denyIfRestricted(
  admin: SupabaseClient,
  businessId: string,
  intent: "send" | "deposit",
): Promise<NextResponse | null> {
  const result = await assertAccountAllows(
    admin,
    { businessId, role: "business", easnerBusinessId: businessId },
    intent,
  )
  if (!result.ok) return v1Error(result.status, result.code, result.message)
  return null
}

export function readIdempotencyKey(request: Request): string | null {
  const value = String(request.headers.get("idempotency-key") ?? "").trim()
  if (!value || value.length > 256) return null
  return value
}

export function readBearerToken(authorizationHeader: string | null): string {
  const raw = String(authorizationHeader ?? "").trim()
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw
}

export async function logPlatformApi(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    method: string
    path: string
    status: number
    errorCode?: string | null
    startedAt?: number
    idempotencyKey?: string | null
  },
): Promise<void> {
  const durationMs =
    input.startedAt != null && Number.isFinite(input.startedAt)
      ? Math.max(0, Date.now() - input.startedAt)
      : null
  console.info(
    JSON.stringify({
      evt: "api.timing",
      surface: "v1",
      method: input.method,
      path: input.path,
      status: input.status,
      ms: durationMs,
    }),
  )
  try {
    await admin.from("platform_api_logs").insert({
      business_id: input.businessId,
      livemode: input.livemode,
      method: input.method,
      path: input.path,
      status: input.status,
      error_code: input.errorCode ?? null,
      ...(durationMs != null ? { duration_ms: durationMs } : {}),
      ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
    })
  } catch (error) {
    console.warn("[platform] api log:", error instanceof Error ? error.message : error)
  }
}

export function parseMinorAmount(raw: unknown): number | null {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}
