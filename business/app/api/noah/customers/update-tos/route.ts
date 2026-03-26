import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv, resolveNoahContext } from "../../_helpers"

export async function PUT(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  let body: { signedAgreementId?: string; type?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  const ctx = resolveNoahContext(user.id, request, body.type)

  const admin = createSupabaseAdmin()
  await admin
    .from("users")
    .update({
      noah_signed_agreement_id: body.signedAgreementId || ctx.noahCustomerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)

  return NextResponse.json({ success: true, hasAcceptedTOS: true, noahScope: ctx.scope })
}
