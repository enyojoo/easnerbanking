import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("terminal_settings")
    .select("default_terminal_payout_id, updated_at")
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    default_terminal_payout_id: data?.default_terminal_payout_id ?? null,
    updated_at: data?.updated_at ?? null,
  })
}

export async function PATCH(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    default_terminal_payout_id?: string | null
  } | null

  const raw = body?.default_terminal_payout_id
  const nextId = raw === null || raw === "" ? null : String(raw)

  const admin = createSupabaseAdmin()

  if (nextId) {
    const { data: payout, error: pErr } = await admin
      .from("terminal_payouts")
      .select("id, recipient_id")
      .eq("id", nextId)
      .eq("business_id", ctx.businessId)
      .maybeSingle()

    if (pErr || !payout) {
      return NextResponse.json(
        { error: "Payout method not found for this business." },
        { status: 400 },
      )
    }

    const { data: rec, error: recErr } = await admin
      .from("recipients")
      .select("id")
      .eq("id", payout.recipient_id as string)
      .eq("user_id", user.id)
      .maybeSingle()

    if (recErr || !rec) {
      return NextResponse.json(
        { error: "Linked recipient is not accessible for your account." },
        { status: 400 },
      )
    }
  }

  const { error: upsertErr } = await admin.from("terminal_settings").upsert(
    {
      business_id: ctx.businessId,
      default_terminal_payout_id: nextId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  )

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, default_terminal_payout_id: nextId })
}
