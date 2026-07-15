import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { listYcRatesAdmin } from "@/lib/admin/yc-rates-service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createSupabaseAdmin()
    const rates = await listYcRatesAdmin(admin)
    return NextResponse.json({ rates })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load Yellowcard rates" },
      { status: 500 },
    )
  }
}
