import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { assertAccountAllows } from "@/lib/account-restriction"
import {
  authenticateMerchantKey,
  requireScope,
  type MerchantKeyContext,
} from "@/lib/checkout/authenticate-merchant-key"
import { checkoutApiError } from "@/lib/checkout/checkout-api-error"

export function v1Error(status: number, code: string, message: string) {
  const { body } = checkoutApiError(status, code, message)
  return NextResponse.json(body, { status })
}

export async function requireMerchant(
  admin: SupabaseClient,
  request: Request,
  scope: string,
): Promise<{ ok: true; ctx: MerchantKeyContext } | { ok: false; response: NextResponse }> {
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
  return { ok: true, ctx: auth.ctx }
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
  },
): Promise<void> {
  try {
    await admin.from("platform_api_logs").insert({
      business_id: input.businessId,
      livemode: input.livemode,
      method: input.method,
      path: input.path,
      status: input.status,
      error_code: input.errorCode ?? null,
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
