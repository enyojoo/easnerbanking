import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"

function parseKind(raw: string): "user" | "business" | null {
  if (raw === "user" || raw === "business") return raw
  return null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { kind: kindRaw, id } = await params
  const kind = parseKind(kindRaw)
  if (!kind || !id) return NextResponse.json({ error: "Invalid subject" }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as {
    currencies?: unknown
    add?: string
    remove?: string
  }
  const admin = createSupabaseAdmin()
  const table = kind === "business" ? "businesses" : "users"
  const { data: row } = await admin
    .from(table)
    .select("enabled_extra_account_currencies")
    .eq("id", id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const current = Array.isArray(row.enabled_extra_account_currencies)
    ? (row.enabled_extra_account_currencies as string[]).map((c) => String(c).toUpperCase())
    : []

  let next = current
  if (Array.isArray(body.currencies)) {
    next = body.currencies.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
  } else if (body.add) {
    const code = body.add.trim().toUpperCase()
    if (code && !current.includes(code)) next = [...current, code]
  } else if (body.remove) {
    const code = body.remove.trim().toUpperCase()
    next = current.filter((c) => c !== code)
  }

  const { error } = await admin
    .from(table)
    .update({
      enabled_extra_account_currencies: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction(auth.ctx.userId, "accounts.extra_currencies", id, { kind, currencies: next })
  return NextResponse.json({ ok: true, extraCurrencies: next })
}
