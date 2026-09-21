import { NextResponse } from "next/server"
import { EXPLORER_ENDPOINTS } from "@/lib/console/explorer-catalog"
import { interpolateWorkbenchPath, runWorkbenchEndpoint } from "@/lib/console/workbench"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    keyId?: string
    endpointId?: string
    path?: string
    method?: string
    body?: Record<string, unknown>
  } | null

  const admin = createSupabaseAdmin()
  const { data: key } = await admin
    .from("business_api_keys")
    .select("id, mode, scopes, revoked_at")
    .eq("id", String(body?.keyId ?? ""))
    .eq("business_id", ctx.businessId)
    .maybeSingle()
  if (!key || key.revoked_at) {
    return NextResponse.json({ error: "Choose an active key" }, { status: 400 })
  }

  const endpoint =
    EXPLORER_ENDPOINTS.find((item) => item.id === body?.endpointId) ??
    EXPLORER_ENDPOINTS.find((item) => item.method === body?.method && item.path === body?.path)
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint is not in Workbench" }, { status: 400 })
  }

  const scopes = Array.isArray(key.scopes) ? key.scopes.map(String) : []
  if (!scopes.includes(endpoint.scope)) {
    return NextResponse.json(
      { error: { type: "invalid_request_error", code: "key_forbidden", message: "This key is missing that scope." } },
      { status: 403 },
    )
  }

  const payload = body?.body && typeof body.body === "object" ? body.body : {}
  const path = interpolateWorkbenchPath(endpoint.path, payload)
  const result = await runWorkbenchEndpoint(admin, {
    businessId: ctx.businessId,
    livemode: key.mode === "live",
    method: endpoint.method,
    path,
    body: payload,
  })
  return NextResponse.json(result.json, { status: result.status })
}
