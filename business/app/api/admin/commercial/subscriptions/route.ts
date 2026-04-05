import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("user_subscriptions")
    .select("*, pricing_plans(code, name, plan_type)")
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscriptions: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const body = (await request.json().catch(() => null)) as
    | {
        userId?: string
        businessId?: string
        planId?: string
        scope?: string
        startsAt?: string
        endsAt?: string | null
        freePayoutsPerPeriod?: number
        fxMarkupDiscountBps?: number
        prioritySupport?: boolean
        rateLockSeconds?: number
        batchPayoutAccess?: boolean
        apiAccess?: boolean
        approvalWorkflowsEnabled?: boolean
      }
    | null
  const userId = String(body?.userId || "").trim()
  const planId = String(body?.planId || "").trim()
  if (!userId || !planId) {
    return NextResponse.json({ error: "userId and planId are required" }, { status: 400 })
  }
  const { data, error } = await admin
    .from("user_subscriptions")
    .insert({
      user_id: userId,
      business_id: body?.businessId || null,
      plan_id: planId,
      scope: body?.scope || "individual",
      status: "active",
      starts_at: body?.startsAt || new Date().toISOString(),
      ends_at: body?.endsAt || null,
      free_payouts_per_period: Number(body?.freePayoutsPerPeriod ?? 0),
      fx_markup_discount_bps: Number(body?.fxMarkupDiscountBps ?? 0),
      priority_support: Boolean(body?.prioritySupport ?? false),
      rate_lock_seconds: Number(body?.rateLockSeconds ?? 300),
      batch_payout_access: Boolean(body?.batchPayoutAccess ?? false),
      api_access: Boolean(body?.apiAccess ?? false),
      approval_workflows_enabled: Boolean(body?.approvalWorkflowsEnabled ?? false),
    })
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscription: data })
}
