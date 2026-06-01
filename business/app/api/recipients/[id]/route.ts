import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { payoutCorridorGate } from "@/lib/payout-corridor-validation"
import {
  looksLikeMissingStructuredColumn,
  toRecipientLegacyPayload,
  type RecipientWritePayload,
} from "@/lib/recipients-write-payload"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params

  let payload = {} as RecipientWritePayload
  try {
    payload = (await request.json()) as RecipientWritePayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: existing } = await admin
    .from("recipients")
    .select("country_code,currency,mobile_provider,wallet_network,bank_name")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const merged = {
    country_code: payload.country_code ?? existing.country_code ?? null,
    currency: payload.currency ?? existing.currency ?? "",
    mobile_provider: payload.mobile_provider ?? existing.mobile_provider ?? null,
    wallet_network: payload.wallet_network ?? existing.wallet_network ?? null,
    bank_name: payload.bank_name ?? existing.bank_name ?? null,
  }
  const gate = await payoutCorridorGate(admin, merged)
  if (gate) return gate

  const primary = await admin
    .from("recipients")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single()
  if (!primary.error) return NextResponse.json({ recipient: primary.data })

  if (!looksLikeMissingStructuredColumn(primary.error)) {
    return NextResponse.json(
      {
        error: primary.error.message,
        code: primary.error.code,
        details: primary.error.details,
        hint: primary.error.hint,
      },
      { status: 400 },
    )
  }

  const fallback = await admin
    .from("recipients")
    .update(toRecipientLegacyPayload(payload))
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single()
  if (!fallback.error) return NextResponse.json({ recipient: fallback.data })

  return NextResponse.json(
    {
      error: fallback.error.message,
      code: fallback.error.code,
      details: fallback.error.details,
      hint: fallback.error.hint,
    },
    { status: 400 },
  )
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params

  const admin = createSupabaseAdmin()
  const { error } = await admin.from("recipients").delete().eq("id", id).eq("user_id", user.id)
  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      { status: 400 },
    )
  }
  return NextResponse.json({ ok: true })
}
