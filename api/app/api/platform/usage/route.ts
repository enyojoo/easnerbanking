import { NextResponse } from "next/server"
import { v1BusinessReadLimit, v1BusinessWriteLimit } from "@/lib/api/rate-limit"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const DAYS = 14

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: writeWindow }, { data: logs }] = await Promise.all([
    admin
      .from("api_rate_limits")
      .select("request_count, window_started_at")
      .eq("rate_key", `v1:write:${ctx.businessId}`)
      .maybeSingle(),
    admin
      .from("platform_api_logs")
      .select("status, created_at")
      .eq("business_id", ctx.businessId)
      .eq("livemode", livemode)
      .gte("created_at", since),
  ])

  const byDay = new Map<string, { total: number; errors: number }>()
  for (const row of logs ?? []) {
    const day = String(row.created_at).slice(0, 10)
    const bucket = byDay.get(day) ?? { total: 0, errors: 0 }
    bucket.total += 1
    if (typeof row.status === "number" && row.status >= 400) bucket.errors += 1
    byDay.set(day, bucket)
  }
  const daily = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bucket]) => ({ day, ...bucket }))

  const windowStale = writeWindow
    ? Date.now() - new Date(writeWindow.window_started_at as string).getTime() > 60_000
    : true

  return NextResponse.json({
    limits: {
      businessWritePerMinute: v1BusinessWriteLimit(),
      businessReadPerMinute: v1BusinessReadLimit(),
    },
    currentWindow: {
      writeRequestsThisMinute: windowStale ? 0 : Number(writeWindow?.request_count ?? 0),
    },
    daily,
  })
}
