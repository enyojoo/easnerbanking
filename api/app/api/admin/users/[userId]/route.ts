import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { userId } = await ctx.params
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from("users").select("*").eq("id", userId).maybeSingle()
  if (error) {
    console.error("admin users get:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json(data)
}
