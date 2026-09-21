import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const PAGE_SIZE = 50

function statusRangeFilter(raw: string | null): { gte?: number; lte?: number; eq?: number } | null {
  if (!raw) return null
  if (raw === "4xx") return { gte: 400, lte: 499 }
  if (raw === "5xx") return { gte: 500, lte: 599 }
  const num = Number(raw)
  return Number.isFinite(num) ? { eq: num } : null
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const params = new URL(request.url).searchParams
  const livemode = params.get("livemode") === "live"
  const id = params.get("id")
  const method = params.get("method")
  const path = params.get("path")
  const since = params.get("since")
  const until = params.get("until")
  const cursor = params.get("cursor")
  const status = statusRangeFilter(params.get("status"))

  const admin = createSupabaseAdmin()
  const columns = "id, method, path, status, error_code, duration_ms, idempotency_key, created_at"
  const fallbackColumns = "id, method, path, status, error_code, duration_ms, created_at"

  const run = async (select: string) => {
    let query = admin
      .from("platform_api_logs")
      .select(select)
      .eq("business_id", ctx.businessId)
      .eq("livemode", livemode)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
    if (id) query = query.eq("id", id)
    if (method) query = query.eq("method", method.toUpperCase())
    if (path) query = query.ilike("path", `%${path}%`)
    if (since) query = query.gte("created_at", since)
    if (until) query = query.lte("created_at", until)
    if (cursor) query = query.lt("created_at", cursor)
    if (status?.eq !== undefined) query = query.eq("status", status.eq)
    if (status?.gte !== undefined) query = query.gte("status", status.gte)
    if (status?.lte !== undefined) query = query.lte("status", status.lte)
    return query
  }

  let { data, error } = await run(columns)
  if (error && (error.code === "42703" || /idempotency_key/i.test(error.message || ""))) {
    ;({ data, error } = await run(fallbackColumns))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const logs = (data ?? []) as unknown as Array<{ created_at: string }>
  const nextCursor = logs.length === PAGE_SIZE ? logs[logs.length - 1].created_at : null

  return NextResponse.json({ logs, nextCursor })
}
