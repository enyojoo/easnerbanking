import { NextResponse } from "next/server"
import { startPlatformCustomerVerification } from "@/lib/platform/receive"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const business = await requireEasnerBusinessId(user.id)
  if (!business.ok) return business.response
  const { id } = await ctx.params
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const body = (await request.json().catch(() => null)) as { return_url?: string } | null
  const admin = createSupabaseAdmin()
  try {
    const result = await startPlatformCustomerVerification(admin, {
      businessId: business.businessId,
      livemode,
      customerId: id,
      returnUrl: body?.return_url,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start verification"
    const status = message === "Customer not found" ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
