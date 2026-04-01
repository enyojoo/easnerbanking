import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"

/**
 * Wallet shape for send/receive flows. Easner stores optional address data in `wallets`
 * when synced; the route returns Noah customer id as `walletId` for compatibility with mobile.
 */
export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(acc.ctx.subjectUserId, acc.ctx.scope)
  if (guard) return guard

  const { noahCustomerId, subjectUserId } = acc.ctx

  let address = ""
  let blockchain_memo: string | null = null

  try {
    await provisionNoahArtifactsForCustomer({
      subjectUserId,
      noahCustomerId,
      scope: acc.ctx.scope,
    })
    const admin = createSupabaseAdmin()
    const { data: userRow } = await admin
      .from("users")
      .select("noah_wallet_id")
      .eq("id", subjectUserId)
      .maybeSingle()
    const wid = userRow?.noah_wallet_id as string | undefined
    if (wid) {
      const { data: w } = await admin
        .from("wallets")
        .select("address, blockchain_memo")
        .eq("noah_wallet_id", wid)
        .maybeSingle()
      if (w?.address) address = String(w.address)
      if (w?.blockchain_memo != null) blockchain_memo = String(w.blockchain_memo)
    }
  } catch {
    /* optional DB */
  }

  return NextResponse.json({
    wallets: [
      {
        walletId: noahCustomerId,
        chain: "solana",
        address,
        blockchain_memo,
      },
    ],
  })
}
