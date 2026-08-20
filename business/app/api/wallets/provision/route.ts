import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { linkTurnkeySubOrganizationAndEnqueueVaults } from "@/lib/wallet/turnkey-wallet-db"

export const runtime = "nodejs"

/**
 * POST – link Turnkey sub-organization after embedded signup; enqueue vault jobs.
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const body = (await request.json().catch(() => null)) as
    | { turnkeySubOrganizationId?: string; idempotencyKey?: string }
    | null
  const subOrg = String(body?.turnkeySubOrganizationId || "").trim()
  if (!subOrg) {
    return NextResponse.json({ error: "turnkeySubOrganizationId is required" }, { status: 400 })
  }

  const ownerType = acc.ctx.scope === "business" ? "business" : "individual"
  const ownerRef =
    acc.ctx.scope === "business" && acc.ctx.subjectBusinessId
      ? acc.ctx.subjectBusinessId
      : acc.ctx.subjectUserId

  const admin = createSupabaseAdmin()
  let walletOwnerId: string
  try {
    const out = await linkTurnkeySubOrganizationAndEnqueueVaults(admin, {
      ownerType,
      ownerRef,
      turnkeySubOrganizationId: subOrg,
      noahCustomerId: acc.ctx.noahCustomerId,
    })
    walletOwnerId = out.walletOwnerId
  } catch (e) {
    const msg = e instanceof Error ? e.message : "wallet_owners upsert failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ ok: true, walletOwnerId })
}
