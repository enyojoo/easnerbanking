import { NextResponse } from "next/server"
import { completePlatformOnrampSession } from "@/lib/platform/receive"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const { id } = await ctx.params
  try {
    const result = await completePlatformOnrampSession(admin, id)
    return NextResponse.json(result)
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "complete_failed"
    const status = code === "not_available" ? 403 : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not complete session", code },
      { status },
    )
  }
}
