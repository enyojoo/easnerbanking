import { NextResponse } from "next/server"
import {
  confirmPlatformTransfer,
  merchantTriedToConfirm,
  platformTransferHttpError,
  readTransferClientSecret,
} from "@/lib/platform/transfer-authorize"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (merchantTriedToConfirm(request.headers.get("authorization"))) {
    return NextResponse.json(
      { error: "The customer must authorize this send", code: "customer_action_required" },
      { status: 403 },
    )
  }
  const admin = createSupabaseAdmin()
  const { id } = await ctx.params
  const body = (await request.json().catch(() => null)) as { client_secret?: string } | null
  const url = new URL(request.url)
  const clientSecret = readTransferClientSecret({
    authorizationHeader: request.headers.get("authorization"),
    bodySecret: body?.client_secret,
    querySecret: url.searchParams.get("client_secret"),
  })
  if (!clientSecret) {
    return NextResponse.json({ error: "client_secret is required", code: "invalid_client_secret" }, { status: 401 })
  }
  try {
    const transfer = await confirmPlatformTransfer(admin, { transferId: id, clientSecret })
    return NextResponse.json(transfer)
  } catch (error) {
    const mapped = platformTransferHttpError(error)
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status })
  }
}
