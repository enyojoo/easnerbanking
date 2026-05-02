import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { executeEasetagTransfer, isEasetagLedgerP2PEnabled } from "@/lib/ledger/easetag-transfer"
import { notifyEasetagTransferSettled } from "@/lib/ledger/easetag-transfer-notify"

export const runtime = "nodejs"

type Body = {
  destination_easetag?: string
  destinationEasetag?: string
  amount?: string | number
  currency?: string
  reserved_debit_etid?: string
}

/**
 * Instant Easetag P2P via internal ledger (USD/EUR buckets). Requires `EASETAG_LEDGER_P2P_ENABLED=true`.
 * @see supabase migration `transfer_easetag_p2p`
 */
export async function POST(request: Request) {
  if (!isEasetagLedgerP2PEnabled()) {
    return NextResponse.json({ ok: false, error: "easetag_ledger_p2p_disabled" }, { status: 503 })
  }

  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as Body | null
  const tag = String(body?.destination_easetag || body?.destinationEasetag || "").trim()
  const amount = Number.parseFloat(String(body?.amount ?? ""))
  const currencyRaw = String(body?.currency || "usd").trim().toUpperCase()

  if (!tag || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "destination_easetag and positive amount required" }, { status: 400 })
  }
  if (currencyRaw !== "USD" && currencyRaw !== "EUR") {
    return NextResponse.json({ error: "currency must be USD or EUR" }, { status: 400 })
  }

  const acc = await resolveNoahAccountContext(request, auth.user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const admin = createSupabaseAdmin()
  const cleanTag = normalizeEasetag(tag)

  const { data: meRow, error: meErr } = await admin.from("users").select("id,easner_business_id").eq("id", auth.user.id).maybeSingle()
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 })
  const myBusinessId = (meRow?.easner_business_id as string | null | undefined) ?? null

  const { data: payeeUser, error: payeeUserErr } = await admin.from("users").select("id,easetag").eq("easetag", cleanTag).maybeSingle()
  if (payeeUserErr && !isUndefinedEasetagColumnError(payeeUserErr)) {
    return NextResponse.json({ error: payeeUserErr.message }, { status: 400 })
  }
  const resolvedPayeeUser = payeeUserErr && isUndefinedEasetagColumnError(payeeUserErr) ? null : payeeUser

  let payeeEasetagResolved = cleanTag
  let payeeUserId: string | undefined
  let payeeBusinessId: string | undefined

  if (resolvedPayeeUser) {
    if (resolvedPayeeUser.id === auth.user.id) {
      return NextResponse.json({ error: "You cannot send to yourself." }, { status: 400 })
    }
    payeeEasetagResolved = String(resolvedPayeeUser.easetag || cleanTag)
    payeeUserId = String(resolvedPayeeUser.id)
    payeeBusinessId = undefined
  } else {
    const { data: biz, error: bizErr } = await admin.from("businesses").select("id,easetag").eq("easetag", cleanTag).maybeSingle()
    if (bizErr) return NextResponse.json({ error: bizErr.message }, { status: 400 })
    if (!biz) return NextResponse.json({ error: "Easetag not found." }, { status: 404 })
    if (myBusinessId && biz.id === myBusinessId) {
      return NextResponse.json({ error: "You cannot send to yourself." }, { status: 400 })
    }
    payeeEasetagResolved = String(biz.easetag || cleanTag)
    payeeBusinessId = String(biz.id)
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, biz.id as string)
    payeeUserId = ownerUserId || undefined
    if (!payeeUserId) {
      return NextResponse.json({ error: "Payee organization has no owner on file." }, { status: 400 })
    }
  }

  const senderBusinessId = acc.ctx.scope === "business" && acc.ctx.subjectBusinessId ? acc.ctx.subjectBusinessId : null
  const senderUserId = acc.ctx.subjectUserId

  const idemHeader = request.headers.get("idempotency-key")?.trim() || request.headers.get("x-idempotency-key")?.trim()
  const idempotencyKey =
    idemHeader ||
    `easetag:${senderBusinessId || senderUserId}:${payeeBusinessId || payeeUserId}:${currencyRaw}:${amount}:${cleanTag}`

  const reservedDebit =
    typeof body?.reserved_debit_etid === "string" ? body.reserved_debit_etid.trim() : ""

  const result = await executeEasetagTransfer(admin, {
    idempotencyKey,
    amount,
    currency: currencyRaw as "USD" | "EUR",
    senderUserId,
    senderBusinessId,
    payeeUserId: payeeUserId!,
    payeeBusinessId: payeeBusinessId ?? null,
    payeeEasetag: payeeEasetagResolved,
    reservedDebitEtid: reservedDebit || undefined,
  })

  if (!result.ok) {
    const status =
      result.error === "insufficient_balance" || result.error === "sender_balance_row_missing" ? 400 : 400
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }

  await notifyEasetagTransferSettled(admin, {
    idempotent: result.idempotent,
    debitProviderTransactionId: result.debitProviderTransactionId,
    creditProviderTransactionId: result.creditProviderTransactionId,
  }).catch((e) => console.warn("easetag transfer notify:", e))

  return NextResponse.json({
    ok: true,
    idempotent: result.idempotent,
    transfer_group_id: result.transferGroupId,
    debit_provider_transaction_id: result.debitProviderTransactionId,
    credit_provider_transaction_id: result.creditProviderTransactionId,
    easner_transaction_id: result.easnerTransactionId,
  })
}
