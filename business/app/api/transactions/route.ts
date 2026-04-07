import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("limit") || "100", 10) || 100),
  )

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("transactions")
    .select(
      "id, status, amount, currency, direction, metadata, payload, noah_transaction_id, created_at, updated_at",
    )
    .eq("business_id", ctx.businessId)
    .eq("provider", "noah")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const transactions = (rows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const payload = row.payload as Record<string, unknown> | null | undefined
    const meta = row.metadata as Record<string, unknown> | null | undefined
    const dirRaw = String(row.direction ?? "").toLowerCase()
    const direction = dirRaw === "in" ? "credit" : "debit"
    const st = String(row.status ?? "").toLowerCase()
    const status =
      st === "settled" ? "completed"
      : st === "pending" || st === "processing" ? st
      : st === "failed" || st === "cancelled" ? "failed"
      : st === "unknown" ? "pending"
      : (st as "completed" | "pending" | "processing" | "failed")

    const nameFromPayload =
      payload && typeof payload === "object" ?
        String(
          (payload.FiatPayment as Record<string, unknown>)?.MerchantName ??
            payload.MerchantName ??
            payload.Network ??
            "",
        ).trim()
      : ""

    const description =
      nameFromPayload ||
      (meta?.collection_channel === "autopayout" ? "Stablecoin QR Pay" : "Stablecoin activity")

    const created = row.created_at != null ? String(row.created_at) : new Date().toISOString()

    const currencyCode = String(row.currency ?? "USD")
    const noahId = row.noah_transaction_id != null ? String(row.noah_transaction_id) : undefined
    return {
      id: String(row.id),
      type: "book" as const,
      amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
      displayCurrency: currencyCode,
      description,
      date: created,
      status,
      direction,
      source: "account" as const,
      reference: noahId,
      collectionChannel:
        meta?.collection_channel != null ? String(meta.collection_channel) : undefined,
      autopayoutConfigId:
        meta?.autopayout_config_id != null ? String(meta.autopayout_config_id) : undefined,
    }
  })

  return NextResponse.json({ transactions })
}
