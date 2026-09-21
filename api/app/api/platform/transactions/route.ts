import { NextResponse } from "next/server"
import { publicTransaction } from "@/lib/platform/ledger"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

function maskDetails(type: string, details: Record<string, unknown> | null | undefined) {
  const raw = details && typeof details === "object" ? details : {}
  if (type === "bank") {
    const acct = String(raw.account_number ?? raw.iban ?? "")
    return { last4: acct ? acct.slice(-4) : null }
  }
  if (type === "wallet") {
    const address = String(raw.address ?? "")
    return { address: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null }
  }
  if (type === "easetag") return { easetag: raw.easetag ?? raw.handle ?? null }
  if (type === "mobile_money") {
    const phone = String(raw.phone ?? raw.msisdn ?? "")
    return { last4: phone ? phone.slice(-4) : null }
  }
  return {}
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const params = new URL(request.url).searchParams
  const livemode = params.get("livemode") === "live"
  const q = params.get("q")?.trim().toLowerCase() ?? ""
  const type = params.get("type")?.trim() ?? ""
  const admin = createSupabaseAdmin()
  let query = admin
    .from("platform_transactions")
    .select(
      "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
    )
    .eq("business_id", ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  if (type) query = query.eq("type", type)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const rows = data ?? []
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))] as string[]
  const transferIds = [...new Set(rows.map((row) => row.transfer_id).filter(Boolean))] as string[]

  const [{ data: customers }, { data: transfers }] = await Promise.all([
    customerIds.length
      ? admin.from("platform_customers").select("id, name, email").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; email: string | null }[] }),
    transferIds.length
      ? admin
          .from("platform_transfers")
          .select("id, source_account_id, destination_id, quote_id")
          .in("id", transferIds)
      : Promise.resolve({
          data: [] as { id: string; source_account_id: string | null; destination_id: string | null; quote_id: string | null }[],
        }),
  ])
  const destIds = [...new Set((transfers ?? []).map((row) => row.destination_id).filter(Boolean))] as string[]
  const { data: destinations } = destIds.length
    ? await admin.from("platform_destinations").select("id, type, details").in("id", destIds)
    : { data: [] as { id: string; type: string; details: Record<string, unknown> | null }[] }

  const customerById = new Map((customers ?? []).map((row) => [row.id, row]))
  const transferById = new Map((transfers ?? []).map((row) => [row.id, row]))
  const destById = new Map((destinations ?? []).map((row) => [row.id, row]))

  const transactions = rows
    .map((row) => {
      const mapped = publicTransaction(row)
      const customer = row.customer_id ? customerById.get(row.customer_id) : null
      const transfer = row.transfer_id ? transferById.get(row.transfer_id) : null
      const dest = transfer?.destination_id ? destById.get(transfer.destination_id) : null
      return {
        ...mapped,
        customer_name: customer?.name || customer?.email || null,
        source: transfer?.source_account_id || mapped.account || null,
        destination_id: dest?.id ?? null,
        destination_type: dest?.type ?? (mapped.checkout_session ? "checkout" : mapped.type),
        destination_label: dest
          ? `${dest.type}${maskDetails(dest.type, dest.details).last4 ? ` · ••••${maskDetails(dest.type, dest.details).last4}` : ""}`
          : mapped.checkout_session || mapped.account || null,
      }
    })
    .filter((row) => {
      if (!q) return true
      const hay = `${row.id} ${row.type} ${row.customer ?? ""} ${row.customer_name ?? ""} ${row.source ?? ""} ${row.destination_label ?? ""} ${row.destination_id ?? ""} ${row.description ?? ""}`.toLowerCase()
      return hay.includes(q)
    })

  return NextResponse.json({ transactions })
}
