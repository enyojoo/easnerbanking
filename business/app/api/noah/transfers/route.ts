import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getNoahSettlementCryptoCurrency } from "@/lib/noah/config"
import { payoutCorridorGate, requireExecutableProviderChannel } from "@/lib/payout-corridor-validation"
import { mapNoahPayoutUserError } from "@/lib/noah/noah-prepare-errors"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import {
  cryptoCurrencyForBalanceCurrency,
  executeTurnkeyOfframpPayout,
} from "@/lib/noah/turnkey-offramp-orchestration"
import { normalizePayoutReviewSnapshot } from "@/lib/noah/build-payout-execute-snapshot"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response
  const noahCtx = noahCtxResult

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as
    | {
        amount?: string | number
        currency?: string
        /** Legacy — ignored; Noah CustomerID resolved from auth. */
        sourceWalletId?: string
        formSessionId?: string
        cryptoAuthorizedAmount?: string
        cryptoCurrency?: string
        countryCode?: string
        channelId?: string
        recipientId?: string
        note?: string
        paymentPurpose?: string
        idempotencyKey?: string
        reservedDebitEtid?: string
        reviewSnapshot?: Record<string, unknown>
        noahFloor?: string
        noahSendAmount?: string
        totalDebited?: string
        marginAmount?: string
        marginCaptureMode?: "surplus_send" | "split_debit"
        customerRate?: number
        noahMid?: number
      }
    | null

  const cryptoCurrencyRaw = String(
    body?.cryptoCurrency || getNoahSettlementCryptoCurrency(),
  ).trim()
  const amountRaw = String(body?.amount ?? "").trim()
  const currencyRaw = String(body?.currency || "").trim().toUpperCase()
  const isIsoFiat = /^[A-Z]{3}$/.test(currencyRaw)
  const fiatCurrency = isIsoFiat ? currencyRaw : ""
  const amount = Number.parseFloat(amountRaw)

  const countryCode = String(body?.countryCode || "").trim().toUpperCase()
  const channelId = String(body?.channelId || "").trim()
  const recipientId = String(body?.recipientId || "").trim()
  const sendNote = typeof body?.note === "string" ? body.note.trim() : ""
  const sendPaymentPurpose =
    typeof body?.paymentPurpose === "string" ? body.paymentPurpose.trim() : ""
  const reviewSnapshot = normalizePayoutReviewSnapshot(body?.reviewSnapshot)
  const idempotencyKey = String(
    body?.idempotencyKey || body?.reservedDebitEtid || request.headers.get("idempotency-key") || "",
  ).trim()
  const formSessionId = String(body?.formSessionId || "").trim()
  const cryptoAuthorizedAmount = String(body?.cryptoAuthorizedAmount || "").trim()

  const isValidPayout =
    Boolean(fiatCurrency) &&
    Boolean(countryCode) &&
    Boolean(recipientId) &&
    Number.isFinite(amount) &&
    amount > 0

  if (!isValidPayout) {
    console.warn("[noah_payout]", {
      stage: "transfers_validation",
      userId: user.id,
      scope: noahCtx.scope,
      fiatCurrency,
      countryCode,
      recipientId: recipientId || null,
      amount,
    })
    return NextResponse.json(
      {
        error:
          "Missing or invalid transfer fields. Required: amount, fiat ISO 4217 currency, countryCode, recipientId.",
      },
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
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
  }

  const recipientRow = rec as RecipientSellPrepareRow
  const bankLabel = String(rec.bank_name || "").toLowerCase()
  const isEasetagRecipient =
    bankLabel.includes("easetag") || bankLabel.includes("easenet")
  const gateRow = {
    country_code: String(rec.country_code || countryCode).toUpperCase(),
    currency: String(rec.currency || fiatCurrency).toUpperCase(),
    bank_name: rec.bank_name,
    mobile_provider: rec.mobile_provider,
    wallet_network: rec.wallet_network,
  }

  if (gateRow.wallet_network || isEasetagRecipient) {
    return NextResponse.json(
      {
        error:
          "Wallet and Easetag recipients cannot use balance Global Payout. Choose a bank or mobile money recipient.",
      },
      { status: 400 },
    )
  }

  const gate = await payoutCorridorGate(admin, gateRow, {
    requireExecutableNoahChannel: requireExecutableProviderChannel(),
  })
  if (gate) return gate

  const orgOwner =
    noahCtx.scope === "business" && noahCtx.businessId
      ? await resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId).catch(() => null)
      : null
  const txUserId = orgOwner ?? user.id

  try {
    const result = await executeTurnkeyOfframpPayout({
      admin,
      ctx: acc.ctx,
      userId: txUserId,
      businessId: noahCtx.businessId,
      recipientRow,
      recipientId,
      fiatAmount: amount,
      fiatCurrency,
      cryptoCurrency: cryptoCurrencyRaw || cryptoCurrencyForBalanceCurrency(fiatCurrency),
      countryCode,
      channelId: channelId || undefined,
      overrides:
        sendNote || sendPaymentPurpose
          ? {
              ...(sendNote ? { note: sendNote } : {}),
              ...(sendPaymentPurpose ? { paymentPurpose: sendPaymentPurpose } : {}),
            }
          : undefined,
      reviewSnapshot: reviewSnapshot ?? undefined,
      sendNote: sendNote || undefined,
      idempotencyKey: idempotencyKey || undefined,
      ...(formSessionId && cryptoAuthorizedAmount
        ? {
            quotedSession: {
              formSessionId,
              cryptoAuthorizedAmount,
              ...(channelId ? { channelId } : {}),
              ...(body?.noahFloor ? { noahFloor: String(body.noahFloor) } : {}),
              ...(body?.noahSendAmount ? { noahSendAmount: String(body.noahSendAmount) } : {}),
              ...(body?.totalDebited ? { totalDebited: String(body.totalDebited) } : {}),
              ...(body?.marginAmount ? { marginAmount: String(body.marginAmount) } : {}),
              ...(body?.marginCaptureMode ? { marginCaptureMode: body.marginCaptureMode } : {}),
              ...(body?.customerRate != null ? { customerRate: Number(body.customerRate) } : {}),
              ...(body?.noahMid != null ? { noahMid: Number(body.noahMid) } : {}),
            },
          }
        : {}),
    })

    if (!result.ok) {
      const err = result.error
      if (err === "insufficient_balance") {
        return NextResponse.json({ error: "Insufficient balance for this payout." }, { status: 400 })
      }
      logNoahPayoutFailure("transfers_offramp", new Error(err), {
        recipientId,
        countryCode,
        fiatCurrency,
        fiatAmount: amount,
        cryptoCurrency: cryptoCurrencyRaw,
        userId: user.id,
        scope: noahCtx.scope,
      })
      return NextResponse.json({ error: mapNoahPayoutUserError(new Error(err), "sell") }, { status: 400 })
    }

    return NextResponse.json({
      id: result.easnerTransactionId,
      transaction_id: result.easnerTransactionId,
      easner_transaction_id: result.easnerTransactionId,
      amount: amount.toFixed(2),
      currency: fiatCurrency.toLowerCase(),
      status: "pending",
    })
  } catch (e: unknown) {
    logNoahPayoutFailure("transfers_offramp", e, {
      recipientId,
      countryCode,
      fiatCurrency,
      fiatAmount: amount,
      cryptoCurrency: cryptoCurrencyRaw,
      userId: user.id,
      scope: noahCtx.scope,
    })
    return NextResponse.json(
      { error: mapNoahPayoutUserError(e, "sell") },
      { status: 400 },
    )
  }
}
