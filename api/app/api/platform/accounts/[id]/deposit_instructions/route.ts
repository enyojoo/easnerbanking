import { NextResponse } from "next/server"
import { getDepositInstructions } from "@/lib/platform/receive"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const business = await requireEasnerBusinessId(user.id)
  if (!business.ok) return business.response
  const { id } = await ctx.params
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  try {
    const instructions = await getDepositInstructions(admin, {
      businessId: business.businessId,
      livemode,
      accountId: id,
    })
    return NextResponse.json({ instructions })
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : ""
    const message = error instanceof Error ? error.message : "Could not load deposit instructions"
    const status = code === "verification_required" ? 403 : message === "Account not found" ? 404 : 400
    return NextResponse.json({ error: message, code: code || undefined }, { status })
  }
}
