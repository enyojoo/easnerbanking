import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import {
  listSystemSettingsAdmin,
  upsertSystemSettingsAdmin,
} from "@/lib/admin/system-settings-service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const admin = createSupabaseAdmin()
    const settings = await listSystemSettingsAdmin(admin)
    return NextResponse.json({ settings })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load system settings" },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as { settings?: unknown } | null
  const rows = Array.isArray(body?.settings) ? body.settings : null
  if (!rows?.length) return NextResponse.json({ error: "settings array required" }, { status: 400 })

  try {
    const admin = createSupabaseAdmin()
    const settings = await upsertSystemSettingsAdmin(
      admin,
      rows.map((row) => {
        const r = row as Record<string, unknown>
        return { key: String(r.key ?? ""), value: r.value }
      }),
    )
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid system settings payload" },
      { status: 400 },
    )
  }
}
