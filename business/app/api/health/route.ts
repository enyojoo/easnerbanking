import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isNoahConfigured } from "@/lib/noah/config"

/**
 * Liveness + dependency checks (Phase A smoke).
 */
export async function GET() {
  const checks: Record<string, string> = {}

  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin.from("users").select("id").limit(1)
    checks.supabase = error ? `error: ${error.message}` : "ok"
  } catch (e) {
    checks.supabase = e instanceof Error ? e.message : "error"
  }

  checks.noah = isNoahConfigured() ? "configured" : "missing NOAH_API_KEY"

  const ok = checks.supabase === "ok"
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 })
}
