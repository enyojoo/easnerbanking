import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { parseEasnerNoahCustomerId } from "@/lib/noah/customer-id"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const admin = createSupabaseAdmin()
  const body = (await request.json().catch(() => null)) as { limit?: number } | null
  const limit = Math.min(100, Math.max(1, Number(body?.limit || 25)))

  const { data: deliveries, error } = await admin
    .from("webhook_deliveries")
    .select("id, event_type, noah_customer_id, payload, error, processed")
    .eq("processed", false)
    .not("error", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let replayed = 0
  let failed = 0
  for (const row of deliveries || []) {
    try {
      const payload = (row.payload || {}) as Record<string, unknown>
      const eventType = String(row.event_type || payload.EventType || "")
      const data = payload.Data as Record<string, unknown> | undefined
      if (eventType === "Transaction" && data) {
        const customerId = data.CustomerID != null ? String(data.CustomerID) : String(row.noah_customer_id || "")
        const parsed = customerId ? parseEasnerNoahCustomerId(customerId) : null
        if (parsed) {
          const id = String(data.ID ?? "")
          const { amount, currency } = pickTxAmountAndCurrency(data)
          const directionRaw = String(data.Direction ?? "").toLowerCase()
          const direction = directionRaw === "in" ? "in" : directionRaw === "out" ? "out" : null
          const status = String(data.Status ?? "").toLowerCase() || "unknown"

          let userId: string | null = null
          let businessId: string | null = null
          if (parsed.kind === "individual") {
            userId = parsed.userId
          } else {
            businessId = parsed.businessId
            userId = await resolveBusinessOrgOwnerUserId(admin, parsed.businessId)
          }

          if (userId) {
            const { error: txErr } = await admin.from("transactions").upsert(
              {
                user_id: userId,
                business_id: businessId,
                provider: "noah",
                noah_transaction_id: id || null,
                status,
                amount,
                currency,
                direction,
                payload: data,
                metadata: { source: "replay_failed_webhook" },
              },
              { onConflict: "provider,noah_transaction_id" },
            )
            if (txErr) throw txErr
          }
        }
      }

      const { error: updErr } = await admin
        .from("webhook_deliveries")
        .update({ processed: true, processed_at: new Date().toISOString(), error: null })
        .eq("id", row.id)
      if (updErr) throw updErr
      replayed++
    } catch (replayErr) {
      failed++
      await admin
        .from("webhook_deliveries")
        .update({ error: replayErr instanceof Error ? replayErr.message : String(replayErr) })
        .eq("id", row.id)
    }
  }

  return NextResponse.json({ ok: true, replayed, failed })
}
