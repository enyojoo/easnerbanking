import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"
import { mapNoahPayoutUserError } from "@/lib/noah/noah-prepare-errors"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
import {
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
  resolvePrimaryPayoutProvider,
} from "@easner/shared"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { sendDestinationFromRow } from "@/lib/send-destination"
import { lockSendDestination } from "@/lib/send-destination-operations"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { loadCorridorRouting } from "@/lib/payout-providers"
import { requirePayoutProviderEnv } from "@/lib/payout-providers/require-provider-env"
import type { PayoutEnvProviderId } from "@/lib/payout-providers/require-provider-env"
import { asYcPayoutError } from "@/lib/yellowcard/payout-errors"

/** Lock balance payout order after user reaches review (Noah + YC + Grid). */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, user.id, "send")
  if (restricted instanceof NextResponse) return restricted

  const [noahCtxResult, acc] = await Promise.all([
    resolveNoahContextAsync(user.id, request),
    resolveNoahAccountContext(request, user.id, undefined, "write"),
  ])
  if (!noahCtxResult.ok) return noahCtxResult.response
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as {
    recipientId?: string
    receiveAmount?: number | string
    sendAmount?: number | string
    amountEntryMode?: "send" | "receive"
    sourceBalanceCurrency?: string
    note?: string
    paymentPurpose?: string
  } | null

  const amountEntryMode = body?.amountEntryMode === "send" ? "send" : "receive"
  let receiveAmount = normalizePayoutReceiveAmount(Number(body?.receiveAmount))
  const sendAmountRaw = Number(body?.sendAmount)
  const sourceBalanceCurrency = String(body?.sourceBalanceCurrency || "USD")
    .trim()
    .toUpperCase()
  const recipientId = String(body?.recipientId || "").trim()

  if (!recipientId || !(receiveAmount > 0)) {
    return NextResponse.json(
      { ok: false, error: "recipientId and receiveAmount are required." },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  const { data: rec } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!rec) {
    return NextResponse.json({ ok: false, error: "Recipient not found." }, { status: 404 })
  }

  const recipientRow = rec as RecipientSellPrepareRow
  receiveAmount = normalizePayoutReceiveAmountForCurrency(
    String(recipientRow.currency || ""),
    receiveAmount,
  )

  const rail =
    rec.mobile_provider || String(rec.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const routing = await loadCorridorRouting(admin, {
    countryCode: String(rec.country_code || "").toUpperCase(),
    currencyCode: String(rec.currency || "").toUpperCase(),
    rail,
  })
  const primary = resolvePrimaryPayoutProvider(routing)
  if (!primary) {
    return NextResponse.json(
      { ok: false, error: "Payout provider is not available for this corridor.", code: "PAYOUT_PROVIDER_UNAVAILABLE" },
      { status: 400 },
    )
  }
  const envProvider: PayoutEnvProviderId =
    primary === "yellowcard" || primary === "grid" ? primary : "noah"
  const envGate = requirePayoutProviderEnv(envProvider)
  if (envGate) return envGate

  try {
    const businessId = noahCtxResult.scope === "business" ? noahCtxResult.businessId : null
    const operationUserId =
      (businessId
        ? await resolveBusinessOrgOwnerUserId(admin, businessId).catch(() => null)
        : null) ?? user.id
    const locked = await lockSendDestination(
      {
        admin,
        accountContext: acc.ctx,
        userId: operationUserId,
        businessId,
        sourceCurrency: sourceBalanceCurrency,
        noahCustomerId: noahCtxResult.noahCustomerId,
      },
      {
        destination: sendDestinationFromRow({ ...recipientRow, id: recipientId }, "recipient"),
        amount: receiveAmount,
        amountEntryMode,
        sendAmount: sendAmountRaw > 0 ? sendAmountRaw : undefined,
        note: typeof body?.note === "string" ? body.note.trim() : undefined,
        purpose: typeof body?.paymentPurpose === "string" ? body.paymentPurpose.trim() : undefined,
        idempotencyKey: `send_lock:${operationUserId}:${recipientId}:${Date.now()}`,
      },
    )

    /**
     * Grid fold (docs/speed-ux-plan.md money-flow pass): the client used to
     * follow this response with a SECOND request (/api/payouts/grid-prepare)
     * that re-did auth + 6 DB reads before attaching the live Grid quote —
     * a full extra HTTPS round trip on every Grid review transition. Attach
     * it here in the same request; on failure return the raw lock so the
     * client's existing grid-prepare fallback still applies.
     */
    const rawLockId = String(
      (locked.rawQuote as { lockId?: unknown } | null)?.lockId ?? "",
    ).trim()
    if (primary === "grid" && rawLockId) {
      try {
        const { data: senderRow } = await admin
          .from("users")
          .select(
            "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
          )
          .eq("id", operationUserId)
          .maybeSingle()
        const { attachLiveGridQuoteToLockSession } = await import(
          "@/lib/payout/confirm-grid-balance-payout"
        )
        const live = await attachLiveGridQuoteToLockSession({
          admin,
          userId: operationUserId,
          lockId: rawLockId,
          recipient: recipientRow,
          senderProfile: {
            residenceCountry: senderRow?.residence_country,
            kycIdType: senderRow?.kyc_id_type,
            kycIdNumber: senderRow?.kyc_id_number,
            ngLocalIdType: senderRow?.ng_local_id_type,
            ngLocalIdNumber: senderRow?.ng_local_id_number,
            fullName: senderRow?.full_name,
            phone: senderRow?.phone,
            email: senderRow?.email,
            dateOfBirth: senderRow?.date_of_birth,
            addressStreet: senderRow?.kyc_address_street,
            addressCity: senderRow?.kyc_address_city,
            addressCountry: senderRow?.kyc_address_country,
          },
        })
        return NextResponse.json({ ok: true, quote: live })
      } catch (e) {
        console.warn(
          "[payouts/confirm] grid live-quote fold failed (client falls back to grid-prepare):",
          e instanceof Error ? e.message : e,
        )
      }
    }

    return NextResponse.json({ ok: true, quote: locked.rawQuote })
  } catch (e) {
    const ycError = asYcPayoutError(e)
    if (ycError) {
      console.warn("[payouts/confirm] yc payout error", ycError.code, ycError.message)
      return NextResponse.json(
        { ok: false, error: ycError.userMessage, code: ycError.code },
        { status: ycError.status },
      )
    }
    logNoahPayoutFailure("payout_confirm", e, { recipientId, receiveAmount })
    const msg = e instanceof Error ? e.message : "Payout confirm failed"
    return NextResponse.json({ ok: false, error: mapNoahPayoutUserError(msg) }, { status: 400 })
  }
}
