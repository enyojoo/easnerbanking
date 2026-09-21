import { NextResponse } from "next/server"
import { publicTransaction } from "@/lib/platform/ledger"
import { publicTransfer, type PlatformTransferRow } from "@/lib/platform/objects"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

function railSentence(type: string, direction: string) {
  if (type === "deposit") return "Bank deposit into the customer vault"
  if (type === "chain") return "On-chain deposit into the customer vault"
  if (type === "onramp") return "Card onramp into the customer vault"
  if (type === "easetag") return "Easetag credit into the customer vault"
  if (type === "checkout") return "Checkout collect onto your business balance"
  if (type === "transfer" && direction === "out") return "Send from the customer vault"
  if (type === "transfer") return "Transfer into the customer vault"
  return type
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const business = await requireEasnerBusinessId(user.id)
  if (!business.ok) return business.response
  const { id } = await ctx.params
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const { data: row } = await admin
    .from("platform_transactions")
    .select(
      "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, metadata, livemode, created_at",
    )
    .eq("id", id)
    .eq("business_id", business.businessId)
    .eq("livemode", livemode)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const customerId = row.customer_id as string | null
  const transferId = row.transfer_id as string | null
  const [{ data: customer }, { data: transfer }] = await Promise.all([
    customerId
      ? admin.from("platform_customers").select("id, name, email").eq("id", customerId).maybeSingle()
      : Promise.resolve({ data: null }),
    transferId
      ? admin
          .from("platform_transfers")
          .select(
            "id, quote_id, source_account_id, destination_id, amount_cents, currency, status, livemode, created_at, expires_at",
          )
          .eq("id", transferId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const destId = transfer?.destination_id as string | null
  const { data: destination } = destId
    ? await admin.from("platform_destinations").select("id, type, details").eq("id", destId).maybeSingle()
    : { data: null }

  const mapped = publicTransaction(row)
  const transferPublic = transfer
    ? publicTransfer(transfer as PlatformTransferRow)
    : null
  const { client_secret: _secret, ...transferSafe } = (transferPublic ?? {}) as Record<string, unknown> & {
    client_secret?: string
  }

  return NextResponse.json({
    transaction: {
      ...mapped,
      metadata: row.metadata ?? {},
      rail: railSentence(mapped.type, mapped.direction),
      incoming: mapped.direction === "in",
      customer_name: customer?.name || customer?.email || null,
      destination: destination
        ? { id: destination.id, type: destination.type }
        : mapped.checkout_session
          ? { id: mapped.checkout_session, type: "checkout" }
          : null,
      transfer: transferPublic
        ? {
            ...transferSafe,
            next_action: transferPublic.next_action,
          }
        : null,
    },
  })
}
