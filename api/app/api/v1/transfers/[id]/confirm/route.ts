import { NextResponse } from "next/server"
import {
  confirmPlatformTransfer,
  merchantTriedToConfirm,
  platformTransferHttpError,
  readTransferClientSecret,
} from "@/lib/platform/transfer-authorize"
import { v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (merchantTriedToConfirm(request.headers.get("authorization"))) {
    return v1Error(403, "customer_action_required", "The customer must authorize this send")
  }
  const admin = createSupabaseAdmin()
  const { id } = await ctx.params
  const body = (await request.json().catch(() => null)) as { client_secret?: string } | null
  const clientSecret = readTransferClientSecret({
    authorizationHeader: request.headers.get("authorization"),
    bodySecret: body?.client_secret,
  })
  if (!clientSecret) {
    return v1Error(401, "invalid_client_secret", "client_secret is required")
  }
  try {
    const transfer = await confirmPlatformTransfer(admin, { transferId: id, clientSecret })
    return NextResponse.json(transfer)
  } catch (error) {
    const mapped = platformTransferHttpError(error)
    return v1Error(mapped.status, mapped.code, mapped.message)
  }
}
