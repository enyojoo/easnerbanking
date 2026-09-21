import { NextResponse } from "next/server"
import { createPlatformCustomer, publicCustomer } from "@/lib/platform/objects"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const CUSTOMER_SELECT =
  "id, email, name, external_id, easetag, status, verification_status, livemode, created_at"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const params = new URL(request.url).searchParams
  const livemode = params.get("livemode") === "live"
  const q = params.get("q")?.trim() ?? ""
  const admin = createSupabaseAdmin()
  let query = admin
    .from("platform_customers")
    .select(CUSTOMER_SELECT)
    .eq("business_id", ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  if (q) {
    const safe = q.replace(/[%*,]/g, "").slice(0, 80)
    if (safe.startsWith("dest_")) {
      const { data: dest } = await admin
        .from("platform_destinations")
        .select("customer_id")
        .eq("id", safe)
        .eq("business_id", ctx.businessId)
        .eq("livemode", livemode)
        .maybeSingle()
      if (dest?.customer_id) {
        query = query.eq("id", dest.customer_id)
      } else {
        query = query.eq("id", "__none__")
      }
    } else if (safe) {
      query = query.or(
        `id.ilike.%${safe}%,email.ilike.%${safe}%,name.ilike.%${safe}%,external_id.ilike.%${safe}%,easetag.ilike.%${safe}%`,
      )
    }
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({
    customers: (data ?? []).map((row) => publicCustomer(row)),
  })
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  if (livemode) {
    return NextResponse.json({ error: "Create test customers while Test is selected." }, { status: 400 })
  }
  const body = (await request.json().catch(() => null)) as {
    email?: string
    name?: string
    external_id?: string
    easetag?: string
  } | null
  const admin = createSupabaseAdmin()
  try {
    const customer = await createPlatformCustomer(admin, {
      businessId: ctx.businessId,
      livemode: false,
      email: body?.email,
      name: body?.name,
      externalId: body?.external_id,
      easetag: body?.easetag,
    })
    return NextResponse.json({ customer }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create customer"
    const code =
      error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : ""
    const status = code === "easetag_taken" ? 409 : 400
    return NextResponse.json({ error: message, code: code || "create_failed" }, { status })
  }
}
