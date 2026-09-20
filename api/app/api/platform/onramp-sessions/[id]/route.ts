import { NextResponse } from "next/server"
import { getPlatformOnrampSession } from "@/lib/platform/receive"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const { id } = await ctx.params
  const session = await getPlatformOnrampSession(admin, id)
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(session)
}
