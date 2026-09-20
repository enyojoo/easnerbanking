import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/**
 * Drives the Developers home quickstart card. Test-mode signals only — a
 * business already on live mode has long since finished onboarding.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const [{ data: keyRows }, { data: logRows }, { data: endpointRows }] = await Promise.all([
    admin
      .from("business_api_keys")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("mode", "test")
      .is("revoked_at", null)
      .limit(1),
    admin
      .from("platform_api_logs")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("livemode", false)
      .limit(1),
    admin
      .from("platform_webhook_endpoints")
      .select("id")
      .eq("business_id", ctx.businessId)
      .is("disabled_at", null)
      .limit(1),
  ])

  return NextResponse.json({
    hasTestKey: (keyRows ?? []).length > 0,
    hasCalledApi: (logRows ?? []).length > 0,
    hasWebhook: (endpointRows ?? []).length > 0,
  })
}
