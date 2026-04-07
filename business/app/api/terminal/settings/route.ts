import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import {
  parseDefaultBalanceCurrency,
  parseTerminalSettlementDestination,
  type TerminalSettlementDestination,
} from "@/lib/terminal/settlement-destination"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("terminal_settings")
    .select(
      "default_terminal_payout_id, settlement_destination, default_balance_currency, updated_at",
    )
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const settlement = parseTerminalSettlementDestination(
    data?.settlement_destination as string | null | undefined,
  )
  const defaultBal = parseDefaultBalanceCurrency(
    data?.default_balance_currency as string | null | undefined,
  )

  return NextResponse.json({
    default_terminal_payout_id: data?.default_terminal_payout_id ?? null,
    settlement_destination: settlement,
    default_balance_currency: defaultBal,
    updated_at: data?.updated_at ?? null,
  })
}

export async function PATCH(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as {
    default_terminal_payout_id?: string | null
    settlement_destination?: string | null
    default_balance_currency?: string | null
  } | null

  const admin = createSupabaseAdmin()

  const { data: existingRow } = await admin
    .from("terminal_settings")
    .select(
      "default_terminal_payout_id, settlement_destination, default_balance_currency",
    )
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  let nextSettlement: TerminalSettlementDestination = parseTerminalSettlementDestination(
    existingRow?.settlement_destination as string | null | undefined,
  )
  let nextDefaultBalance = parseDefaultBalanceCurrency(
    existingRow?.default_balance_currency as string | null | undefined,
  )

  if (body?.settlement_destination != null) {
    nextSettlement = parseTerminalSettlementDestination(String(body.settlement_destination))
  }
  if (body && "default_balance_currency" in body) {
    const rawBal = body.default_balance_currency
    if (rawBal === null || rawBal === "") {
      nextDefaultBalance = null
    } else {
      const parsed = parseDefaultBalanceCurrency(String(rawBal))
      if (!parsed) {
        return NextResponse.json(
          { error: "default_balance_currency must be USD, EUR, or null." },
          { status: 400 },
        )
      }
      nextDefaultBalance = parsed
    }
  }

  if (nextSettlement === "easner_balance" && !nextDefaultBalance) {
    nextDefaultBalance = "USD"
  }

  const rawPayout = body && "default_terminal_payout_id" in body ? body.default_terminal_payout_id : undefined
  const nextId =
    rawPayout === undefined
      ? ((existingRow?.default_terminal_payout_id as string | null) ?? null)
      : rawPayout === null || rawPayout === ""
        ? null
        : String(rawPayout)

  if (nextId) {
    const { data: payout, error: pErr } = await admin
      .from("terminal_payouts")
      .select("id, recipient_id")
      .eq("id", nextId)
      .eq("business_id", ctx.businessId)
      .maybeSingle()

    if (pErr || !payout) {
      return NextResponse.json(
        { error: "Payout method not found for this business." },
        { status: 400 },
      )
    }

    const { data: rec, error: recErr } = await admin
      .from("recipients")
      .select("id")
      .eq("id", payout.recipient_id as string)
      .eq("user_id", user.id)
      .maybeSingle()

    if (recErr || !rec) {
      return NextResponse.json(
        { error: "Linked recipient is not accessible for your account." },
        { status: 400 },
      )
    }
  }

  const { error: upsertErr } = await admin.from("terminal_settings").upsert(
    {
      business_id: ctx.businessId,
      default_terminal_payout_id: nextId,
      settlement_destination: nextSettlement,
      default_balance_currency: nextSettlement === "easner_balance" ? nextDefaultBalance : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  )

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    default_terminal_payout_id: nextId,
    settlement_destination: nextSettlement,
    default_balance_currency: nextSettlement === "easner_balance" ? nextDefaultBalance : null,
  })
}
