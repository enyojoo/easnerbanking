import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isRelayTronInboundEnabled } from "@/lib/relay/config"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { ensureRelayTronUsdtDepositAddress } from "@/lib/relay-deposit/list-addresses"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  if (!isRelayTronInboundEnabled()) {
    return NextResponse.json({ enabled: false, status: "unavailable", addresses: [] })
  }

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, auth.user.id, "deposit")
  if (restricted instanceof NextResponse) return restricted

  const acc = await resolveNoahAccountContext(request, auth.user.id)
  if (!acc.ok) return acc.response

  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, acc.ctx)
  if (!ownerId) {
    return NextResponse.json({ enabled: true, addresses: [], status: "provisioning" })
  }

  const payload = await ensureRelayTronUsdtDepositAddress(admin, ownerId)
  return NextResponse.json(payload)
}
