import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { payoutCorridorGate } from "@/lib/payout-corridor-validation"
import {
  recipientFormNeedsBankCode,
  recipientFormNeedsEmail,
  recipientFormNeedsPhone,
} from "@easner/shared"
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
    .select("country_code,currency,mobile_provider,wallet_network,bank_name,swift_bic,phone_number,email")
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

  const cc = String(merged.country_code || "").toUpperCase()
  const cur = String(merged.currency || "").toUpperCase()
  const isMobile = Boolean(merged.mobile_provider)
  const bankLabel = String(merged.bank_name || "").toLowerCase()
  const isEasetagRow = bankLabel.includes("easetag") || bankLabel.includes("easenet")
  if (cc && cur && !merged.wallet_network && !isEasetagRow) {
    const rail = isMobile ? "mobile_money" : "bank_transfer"
    const { data: corridor } = await admin
      .from("payout_corridors")
      .select("fields_schema")
      .eq("country_code", cc)
      .eq("currency_code", cur)
      .eq("rail", rail)
      .maybeSingle()
    const bankEnum = (
      corridor?.fields_schema as { bank_enum?: string[] } | null | undefined
    )?.bank_enum
    const bankName = String(payload.bank_name ?? existing.bank_name ?? "").trim()
    if (
      !isMobile &&
      Array.isArray(bankEnum) &&
      bankEnum.length > 0 &&
      bankName &&
      !bankEnum.includes(bankName)
    ) {
      return NextResponse.json(
        { error: "Bank must be selected from the corridor list." },
        { status: 400 },
      )
    }
    const fieldsSchema = corridor?.fields_schema as
      | { needs_email?: boolean; needs_phone?: boolean; needs_bank_code?: boolean }
      | null
      | undefined
    if (!isMobile && recipientFormNeedsEmail(fieldsSchema ?? null)) {
      const em = String(payload.email ?? existing.email ?? "").trim()
      if (!em) {
        return NextResponse.json(
          { error: "Email is required for this payout corridor." },
          { status: 400 },
        )
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        return NextResponse.json({ error: "Invalid email address." }, { status: 400 })
      }
    }
    if (!isMobile && recipientFormNeedsPhone(fieldsSchema ?? null)) {
      const phone = String(payload.phone_number ?? existing.phone_number ?? "").replace(/\s/g, "")
      if (!phone) {
        return NextResponse.json(
          { error: "Phone number is required for this payout corridor." },
          { status: 400 },
        )
      }
    }
    if (!isMobile && recipientFormNeedsBankCode(fieldsSchema ?? null)) {
      const swift = String(payload.swift_bic ?? existing.swift_bic ?? "").trim()
      if (!swift) {
        return NextResponse.json(
          { error: "SWIFT/BIC is required for this payout corridor." },
          { status: 400 },
        )
      }
      if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(swift)) {
        return NextResponse.json({ error: "Invalid SWIFT/BIC code." }, { status: 400 })
      }
    }
  }

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
