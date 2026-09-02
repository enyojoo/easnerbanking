import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { createTurnkeySend } from "@/lib/turnkey/send"
import {
  ledgerAmountToUsd,
  recordVelocityOutboundSpend,
  requireOutboundComplianceAllows,
} from "@/lib/wallet-send-compliance"

export const runtime = "nodejs"

type Body = {
  asset?: "USDC" | "EURC"
  chain?: "solana"
  destinationAddress?: string
  amount?: number | string
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, auth.user.id, "send")
  if (restricted instanceof NextResponse) return restricted

  const accountCtx = await resolveNoahAccountContext(request, auth.user.id, undefined, "write")
  if (!accountCtx.ok) return accountCtx.response

  const body = (await request.json().catch(() => null)) as Body | null
  const asset = String(body?.asset || "").toUpperCase()
  const chain = String(body?.chain || "solana").toLowerCase()
  const destinationAddress = String(body?.destinationAddress || "").trim()
  const amount = Number(body?.amount ?? Number.NaN)
  if ((asset !== "USDC" && asset !== "EURC") || chain !== "solana" || !destinationAddress || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "asset(USDC|EURC), chain(solana), destinationAddress and positive amount are required" },
      { status: 400 },
    )
  }

  const businessId =
    accountCtx.ctx.scope === "business" ? accountCtx.ctx.subjectBusinessId : null
  const amountUsd = ledgerAmountToUsd(amount, asset)
  const compliance = await requireOutboundComplianceAllows(admin, {
    businessId,
    rail: "stablecoin",
    amountUsd,
  })
  if (compliance instanceof NextResponse) return compliance

  try {
    const created = await createTurnkeySend(admin, {
      ctx: accountCtx.ctx,
      asset: asset as "USDC" | "EURC",
      chain: "solana",
      destinationAddress,
      amount,
    })
    if (businessId && created.status !== "failed") {
      await recordVelocityOutboundSpend(admin, businessId, amountUsd).catch((err) => {
        console.error("[wallet-send-compliance] legacy send velocity spend failed:", err)
      })
    }
    return NextResponse.json({
      ok: true,
      provider: "turnkey",
      provider_transaction_id: created.providerTransactionId,
      transaction_id: created.ledgerId,
      status: created.status,
      chain_failure_detail: created.chainFailureDetail,
    })
  } catch (e) {
    const correlationId = crypto.randomUUID()
    const raw = e instanceof Error ? e.message : String(e)
    const publicError =
      raw === "gas_sponsorship_limit_exceeded"
        ? "gas_sponsorship_limit_exceeded"
        : raw === "solana_rent_sponsorship_required"
          ? "solana_rent_sponsorship_required"
          : raw === "gas_sponsorship_not_enabled"
            ? "gas_sponsorship_not_enabled"
            : "send_failed"

    console.error("wallet_send_failed", {
      correlationId,
      provider: "turnkey",
      publicError,
      detail: raw.slice(0, 500),
    })

    return NextResponse.json({ ok: false, error: publicError, correlation_id: correlationId }, { status: 400 })
  }
}
