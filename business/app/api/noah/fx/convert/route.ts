import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"

/**
 * Execute internal stablecoin conversion (USDC ↔ EURC). Noah’s exact swap API is TBD — return 501 until wired.
 */
export async function POST(request: Request) {
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

  return NextResponse.json(
    {
      error: "Move execution is not available yet — Easner has not enabled this action.",
      code: "NOAH_FX_EXECUTE_NOT_IMPLEMENTED",
    },
    { status: 501 },
  )
}
