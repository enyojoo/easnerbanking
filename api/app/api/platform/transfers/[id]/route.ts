import { NextResponse } from "next/server"
import { platformTransferHttpError, readTransferClientSecret, reviewPlatformTransfer } from "@/lib/platform/transfer-authorize"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const { id } = await ctx.params
  const url = new URL(request.url)
  const clientSecret = readTransferClientSecret({
    authorizationHeader: request.headers.get("authorization"),
    querySecret: url.searchParams.get("client_secret"),
  })
  if (!clientSecret) {
    return NextResponse.json({ error: "client_secret is required" }, { status: 401 })
  }
  try {
    const review = await reviewPlatformTransfer(admin, { transferId: id, clientSecret })
    return NextResponse.json(review)
  } catch (error) {
    const mapped = platformTransferHttpError(error)
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
  }
}
