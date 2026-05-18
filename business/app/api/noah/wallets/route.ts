import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"
import { getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"

/**
 * Compatibility route for send/offramp flows that need a Noah `sourceWalletId` (CustomerID)
 * and a Turnkey Solana deposit address — Noah production does not provision custodial wallets.
 */
export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const { noahCustomerId } = acc.ctx

  try {
    await provisionNoahArtifactsForCustomer({
      subjectUserId: acc.ctx.subjectUserId,
      subjectBusinessId: acc.ctx.subjectBusinessId,
      noahCustomerId,
      scope: acc.ctx.scope,
    })
  } catch {
    /* virtual accounts / liquidation are best-effort */
  }

  const admin = createSupabaseAdmin()
  const deposits = await getTurnkeyDepositAddressesForContext(admin, acc.ctx)
  const address = deposits.USD.address.trim()

  return NextResponse.json({
    wallets: [
      {
        walletId: noahCustomerId,
        noahCustomerId,
        /** Noah sell/offramp uses CustomerID when no custodial wallet exists. */
        sourceWalletId: noahCustomerId,
        chain: "solana",
        address,
        blockchain_memo: null,
      },
    ],
  })
}
