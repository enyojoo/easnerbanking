import { NextResponse } from "next/server"
import { createPlatformOnrampSession } from "@/lib/platform/receive"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const business = await requireEasnerBusinessId(user.id)
  if (!business.ok) return business.response
  const { id } = await ctx.params
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const body = (await request.json().catch(() => null)) as {
    amount?: number
    currency?: string
    return_url?: string
  } | null
  const amountCents = Math.round(Number(body?.amount ?? 10_00))
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount must be a positive integer in cents" }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  try {
    const session = await createPlatformOnrampSession(admin, {
      businessId: business.businessId,
      livemode,
      accountId: id,
      amountCents,
      currency: body?.currency,
      returnUrl: body?.return_url,
    })
    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : ""
    const message = error instanceof Error ? error.message : "Could not create onramp session"
    const status = code === "verification_required" ? 403 : message === "Account not found" ? 404 : 400
    return NextResponse.json({ error: message, code: code || undefined }, { status })
  }
}
