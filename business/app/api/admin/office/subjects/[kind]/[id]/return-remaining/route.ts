import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { logAdminAction } from "@/lib/admin-audit"
import {
  OfficeReturnError,
  officeReturnRemaining,
} from "@/lib/office/return-remaining-close"

export const maxDuration = 180

function parseKind(raw: string): "user" | "business" | null {
  if (raw === "user" || raw === "business") return raw
  return null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { kind: kindRaw, id } = await params
  const kind = parseKind(kindRaw)
  if (!kind || !id) return NextResponse.json({ error: "Invalid subject" }, { status: 400 })

  const body = (await request.json().catch(() => ({}))) as {
    reason?: unknown
    destination?: unknown
    destinationAddress?: unknown
    amount?: unknown
    currency?: unknown
  }

  const admin = createSupabaseAdmin()
  try {
    const result = await officeReturnRemaining(admin, {
      kind,
      subjectId: id,
      operatorAdminId: auth.ctx.userId,
      reason: String(body.reason ?? ""),
      destinationAddress: String(body.destinationAddress ?? body.destination ?? ""),
      amount: Number(body.amount),
      currency: body.currency === "EUR" ? "EUR" : "USD",
    })

    await logAdminAction(auth.ctx.userId, "account.return_remaining", id, {
      kind,
      operator: auth.ctx.email ?? auth.ctx.userId,
      reason: String(body.reason ?? "").trim(),
      destination: result.destinationAddress,
      amount: result.amount,
      currency: result.currency,
      asset: result.asset,
      providerTransactionId: result.providerTransactionId,
      txHash: result.txHash,
      sendStatus: result.sendStatus,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof OfficeReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to return remaining" },
      { status: 500 },
    )
  }
}
