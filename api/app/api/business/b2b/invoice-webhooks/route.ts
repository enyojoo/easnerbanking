import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import crypto from "crypto"

export async function GET(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoice_webhook_endpoints")
    .select("id, url, events, enabled, created_at")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ endpoints: data ?? [] })
}

export async function POST(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => ({}))) as {
    url?: string
    events?: string[]
  }
  const url = body.url?.trim()
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  const secret = crypto.randomBytes(32).toString("hex")
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoice_webhook_endpoints")
    .insert({
      business_id: ctx.businessId,
      url,
      secret,
      events: body.events ?? ["invoice.paid"],
      enabled: true,
    })
    .select("id, url, events, enabled, created_at, secret")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ endpoint: data })
}
