import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

const LIST_SELECT =
  "id,statement_id,user_id,business_id,scope,currency,period_from,period_to,available_as_of,time_zone,holder_name,holder_email,available_balance,storage_path,created_at"

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,()]/g, "").trim().slice(0, 80)
}

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const q = sanitizeSearch(url.searchParams.get("q") ?? "")
  const currency = url.searchParams.get("currency")?.trim().toUpperCase() || ""
  const scope = url.searchParams.get("scope")?.trim().toLowerCase() || ""
  const cursor = url.searchParams.get("cursor")?.trim() || ""
  const limitRaw = Number(url.searchParams.get("limit") || "50")
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50

  const admin = createSupabaseAdmin()
  let query = admin
    .from("account_statements")
    .select(LIST_SELECT)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)

  if (currency === "USD" || currency === "EUR") query = query.eq("currency", currency)
  if (scope === "personal" || scope === "business") query = query.eq("scope", scope)
  if (q) {
    query = query.or(
      `statement_id.ilike.%${q}%,holder_name.ilike.%${q}%,holder_email.ilike.%${q}%`,
    )
  }
  if (cursor) {
    const createdAt = cursor.split("|")[0]
    if (createdAt) query = query.lt("created_at", createdAt)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last
      ? `${String(last.created_at)}|${String(last.id)}`
      : null

  return NextResponse.json({
    statements: page,
    nextCursor,
  })
}
