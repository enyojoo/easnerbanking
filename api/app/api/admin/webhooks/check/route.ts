import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { noahFetch } from "@/lib/noah/http"
import { isNoahConfigured } from "@/lib/noah/config"

/**
 * Office compliance: compare Supabase user, Noah webhooks in `event_inbox`, and optional live Noah GET /customers.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")
  const customerId = url.searchParams.get("customerId")

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin.from("users").select("*").eq("id", userId).maybeSingle()

  let webhookEvents: { event_type: string | null; created_at: string; payload: unknown }[] = []
  if (customerId) {
    const { data: inboxRows } = await admin
      .from("event_inbox")
      .select("payload, received_at, event_type")
      .eq("provider", "noah")
      .order("received_at", { ascending: false })
      .limit(200)

    webhookEvents = (inboxRows ?? [])
      .filter((row) => {
        const envelope = row.payload as Record<string, unknown> | undefined
        const data = envelope?.Data as Record<string, unknown> | undefined
        return data?.CustomerID != null && String(data.CustomerID) === customerId
      })
      .slice(0, 50)
      .map((d) => ({
        event_type: d.event_type,
        created_at: d.received_at as string,
        payload: d.payload,
      }))
  }

  const kycEvents = webhookEvents.filter((e) =>
    String(e.event_type ?? "")
      .toLowerCase()
      .includes("customer"),
  ).length

  let noahStatus: { kyc_status?: string } | null = null
  if (customerId && isNoahConfigured()) {
    try {
      const customer = await noahFetch<Record<string, unknown>>({
        method: "GET",
        path: `/customers/${encodeURIComponent(customerId)}`,
      })
      const ver = customer.Verifications as { Status?: string } | undefined
      noahStatus = { kyc_status: ver?.Status ?? "Unknown" }
    } catch {
      noahStatus = { kyc_status: "Error fetching customer" }
    }
  }

  return NextResponse.json({
    summary: {
      totalEvents: webhookEvents.length,
      kycEvents: kycEvents || webhookEvents.length,
    },
    noahStatus,
    bridgeStatus: null,
    userStatus: userRow
      ? {
          noah_kyc_status: userRow.noah_kyc_status,
          noah_kyc_rejection_reasons: userRow.noah_kyc_rejection_reasons,
        }
      : null,
    webhookEvents: webhookEvents.slice(0, 5).map((e) => ({
      event_type: e.event_type,
      created_at: e.created_at,
    })),
  })
}
