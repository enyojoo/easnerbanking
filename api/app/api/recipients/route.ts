import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { payoutCorridorGate } from "@/lib/payout-corridor-validation"
import { validateRecipientYcExtrasForSave } from "@/lib/recipients-yc-validation"
import {
  applyCadRoutingToRecipientMetadata,
  validateRecipientGridExtrasForSave,
} from "@/lib/recipients-grid-validation"
import { attachProviderBindingsToPayload } from "@/lib/recipients-provider-bindings"
import { recipientFormNeedsBankCode, recipientFormNeedsEmail, recipientFormNeedsPhone, isBankNameAllowedForCorridor, projectCorridorForSurface, resolveCorridorRecipientOptions, resolvePrimaryPayoutProvider, unwrapNoahFieldsSchema } from "@easner/shared"
import { loadUserRoutingSurface } from "@/lib/corridor-routing-surface"
import type { RecipientWritePayload } from "@/lib/recipients-write-payload"
import { findOrCreateRecipient } from "@/lib/recipients-find-or-create"

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
  const gate = await payoutCorridorGate(admin, payload as Parameters<typeof payoutCorridorGate>[1], {
    userId: user.id,
  })
  if (gate) return gate
  const routingSurface = await loadUserRoutingSurface(admin, user.id)

  const cc = String(payload.country_code || "").toUpperCase()
  const cur = String(payload.currency || "").toUpperCase()
  const isMobile = Boolean(payload.mobile_provider)
  const bankLabel = String(payload.bank_name || "").toLowerCase()
  const isEasetagRow = bankLabel.includes("easetag") || bankLabel.includes("easenet")
  if (cc && cur && !payload.wallet_network && !isEasetagRow) {
    const rail = isMobile ? "mobile_money" : "bank_transfer"
    const { data: corridor } = await admin
      .from("payout_corridors")
      .select("fields_schema,providers,provider_routing,metadata")
      .eq("country_code", cc)
      .eq("currency_code", cur)
      .eq("rail", rail)
      .maybeSingle()
    const projected = projectCorridorForSurface(
      { provider_routing: corridor?.provider_routing, metadata: corridor?.metadata },
      routingSurface,
    )
    const payoutProvider = resolvePrimaryPayoutProvider(projected.provider_routing)
    const recipientOptions = resolveCorridorRecipientOptions({
      countryCode: cc,
      currencyCode: cur,
      rail,
      fieldsSchema: corridor?.fields_schema,
      providers: corridor?.providers,
      payoutProvider,
    })
    if (
      !isMobile &&
      payload.bank_name?.trim() &&
      !isBankNameAllowedForCorridor(payload.bank_name.trim(), recipientOptions)
    ) {
      return NextResponse.json(
        { error: "Bank must be selected from the corridor list." },
        { status: 400 },
      )
    }
    const fieldsSchema = unwrapNoahFieldsSchema(corridor?.fields_schema)
    if (!isMobile && recipientFormNeedsEmail(fieldsSchema ?? null)) {
      const em = String(payload.email || "").trim()
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
      const phone = String(payload.phone_number || "").replace(/\s/g, "")
      if (!phone) {
        return NextResponse.json(
          { error: "Phone number is required for this payout corridor." },
          { status: 400 },
        )
      }
    }
    if (!isMobile && recipientFormNeedsBankCode(fieldsSchema ?? null)) {
      const swift = String(payload.swift_bic || "").trim()
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

    const ycErr = await validateRecipientYcExtrasForSave(admin, payload, user.id)
    if (ycErr) {
      return NextResponse.json({ error: ycErr }, { status: 400 })
    }
    const mappedCad = applyCadRoutingToRecipientMetadata(payload)
    payload.metadata = mappedCad.metadata
    const gridErr = await validateRecipientGridExtrasForSave(admin, mappedCad, user.id)
    if (gridErr) {
      return NextResponse.json({ error: gridErr }, { status: 400 })
    }

    attachProviderBindingsToPayload({
      payload,
      corridor,
      rail,
    })
  }

  const { recipient, created } = await findOrCreateRecipient(admin, user.id, payload)
  return NextResponse.json({ recipient }, { status: created ? 201 : 200 })
}
