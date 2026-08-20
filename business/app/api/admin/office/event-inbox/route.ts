import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

const PROVIDERS = ["noah", "turnkey", "yellowcard", "grid", "other"] as const
const STATUSES = ["received", "processed", "failed"] as const

/**
 * Office webhook inbox (`event_inbox`) – list recent deliveries for ops.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const provider = url.searchParams.get("provider")?.trim().toLowerCase() || ""
  const status = url.searchParams.get("status")?.trim().toLowerCase() || ""
  const limitRaw = Number(url.searchParams.get("limit") || "100")
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500)

  const admin = createSupabaseAdmin()
  let q = admin
    .from("event_inbox")
    .select("id, provider, event_id, event_type, status, error, payload_hash, received_at, processed_at")
    .order("received_at", { ascending: false })
    .limit(limit)

  if (provider && (PROVIDERS as readonly string[]).includes(provider)) {
    q = q.eq("provider", provider)
  }
  if (status && (STATUSES as readonly string[]).includes(status)) {
    q = q.eq("status", status)
  }

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const [{ count: receivedCount }, { count: processedCount }, { count: failedCount }] = await Promise.all([
    admin.from("event_inbox").select("id", { count: "exact", head: true }).eq("status", "received"),
    admin.from("event_inbox").select("id", { count: "exact", head: true }).eq("status", "processed"),
    admin.from("event_inbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ])

  return NextResponse.json({
    events: data ?? [],
    counts: {
      received: receivedCount ?? 0,
      processed: processedCount ?? 0,
      failed: failedCount ?? 0,
    },
  })
}
