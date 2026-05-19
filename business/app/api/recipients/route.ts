import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { payoutCorridorGate } from "@/lib/payout-corridor-validation"
import {
  looksLikeMissingStructuredColumn,
  type RecipientWritePayload,
} from "@/lib/recipients-write-payload"

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

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const url = new URL(request.url)
  const userId = url.searchParams.get("userId") || user.id
  const ordered = await admin.from("recipients").select("*").eq("user_id", userId).order("created_at", { ascending: false })
  if (!ordered.error) return NextResponse.json({ recipients: ordered.data || [] })

  const unordered = await admin.from("recipients").select("*").eq("user_id", userId)
  if (!unordered.error) return NextResponse.json({ recipients: unordered.data || [] })

  return NextResponse.json(
    {
      error: unordered.error.message,
      code: unordered.error.code,
      details: unordered.error.details,
      hint: unordered.error.hint,
    },
    { status: 400 },
  )
}

export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let payload = {} as RecipientWritePayload
  try {
    payload = (await request.json()) as RecipientWritePayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const gate = await payoutCorridorGate(admin, payload as Parameters<typeof payoutCorridorGate>[1])
  if (gate) return gate

  const primary = await admin
    .from("recipients")
    .insert({ ...payload, user_id: user.id })
    .select("*")
    .single()
  if (!primary.error) return NextResponse.json({ recipient: primary.data }, { status: 201 })

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
    .insert({ ...toLegacyPayload(payload), user_id: user.id })
    .select("*")
    .single()
  if (!fallback.error) return NextResponse.json({ recipient: fallback.data }, { status: 201 })

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
