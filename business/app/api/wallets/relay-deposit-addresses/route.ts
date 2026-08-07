import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isRelayTronInboundEnabled } from "@/lib/relay/config"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  if (!isRelayTronInboundEnabled()) {
    return NextResponse.json({ enabled: false, addresses: [] })
  }

  const acc = await resolveNoahAccountContext(request, auth.user.id)
  if (!acc.ok) return acc.response

  const admin = createSupabaseAdmin()
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, acc.ctx)
  if (!ownerId) {
    return NextResponse.json({ enabled: true, addresses: [], status: "no_wallet_owner" })
  }

  const { data: addr } = await admin
    .from("relay_deposit_addresses")
    .select("tron_address, status, estimated_fee_bps, route, updated_at")
    .eq("wallet_owner_id", ownerId)
    .eq("route", "tron_usdt_to_sol_usdc")
    .maybeSingle()

  const { data: job } = await admin
    .from("relay_deposit_provision_jobs")
    .select("state")
    .eq("wallet_owner_id", ownerId)
    .eq("route", "tron_usdt_to_sol_usdc")
    .in("state", ["pending", "retry"])
    .maybeSingle()

  return NextResponse.json({
    enabled: true,
    status: addr?.status === "active" ? "active" : job ? "provisioning" : "unavailable",
    addresses:
      addr?.status === "active" && addr.tron_address
        ? [
            {
              asset: "USDT",
              network: "Tron",
              address: addr.tron_address,
              estimatedFeeBps: addr.estimated_fee_bps ?? null,
            },
          ]
        : [],
  })
}
