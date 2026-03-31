import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

type RecipientWritePayload = {
  country_code?: string | null
  full_name: string
  account_number: string
  bank_name: string
  phone_number?: string | null
  currency: string
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  transfer_type?: "ACH" | "Wire" | null
  checking_or_savings?: "checking" | "savings" | null
  address_line1?: string | null
  mobile_provider?: string | null
  wallet_network?: string | null
  wallet_memo_tag?: string | null
}

function looksLikeMissingStructuredColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const maybe = error as { message?: string; details?: string; code?: string }
  const text = `${maybe.message || ""} ${maybe.details || ""}`.toLowerCase()
  return maybe.code === "42703" || text.includes("column") || text.includes("schema cache")
}

function toLegacyPayload(payload: RecipientWritePayload) {
  return {
    full_name: payload.full_name,
    account_number: payload.account_number,
    bank_name: payload.bank_name,
    phone_number: payload.phone_number || null,
    currency: payload.currency,
    routing_number: payload.routing_number || null,
    sort_code: payload.sort_code || null,
    iban: payload.iban || null,
    swift_bic: payload.swift_bic || null,
  }
}

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
    .update(toLegacyPayload(payload))
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
