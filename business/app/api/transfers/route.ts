import { NextResponse } from "next/server"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { requireAccountAllowsForUser } from "@/lib/account-restriction"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getNoahSettlementCryptoCurrency } from "@/lib/noah/config"
import {
  payoutCorridorGate,
  requireExecutableProviderChannel,
} from "@/lib/payout-corridor-validation"
import { mapNoahPayoutUserError } from "@/lib/noah/noah-prepare-errors"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { normalizePayoutReviewSnapshot } from "@/lib/noah/build-payout-execute-snapshot"
import { selectProviderForCorridor } from "@/lib/payout-providers"
import { requirePayoutProviderEnv } from "@/lib/payout-providers/require-provider-env"
import { sendDestinationFromRow } from "@/lib/send-destination"
import { executeSendDestination } from "@/lib/send-destination-operations"

type TransferRequest = {
  amount?: string | number
  currency?: string
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
  marginCaptureMode?: "surplus_send" | "split_debit" | "fee_wallet_deferred" | "fee_wallet_omnibus"
  customerRate?: number
  noahMid?: number
  payoutProvider?: "noah" | "yellowcard" | "grid"
  ycSequenceId?: string
  ycSendId?: string
  ycWalletAddress?: string
  ycCryptoAmount?: number
  gridQuoteId?: string
  gridFundingAddress?: string
  gridCryptoAmount?: number
  gridCustomerId?: string
  gridExternalAccountId?: string
  processingFee?: string | number
  channelCost?: string | number
  customerPrincipal?: string | number
  lockId?: string
}

/** Execute a locked normalized Send destination after review and PIN. */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const admin = createSupabaseAdmin()
  const restricted = await requireAccountAllowsForUser(admin, user.id, "send")
  if (restricted instanceof NextResponse) return restricted

  const noahContext = await resolveNoahContextAsync(user.id, request)
  if (!noahContext.ok) return noahContext.response
  const account = await resolveNoahAccountContext(request, user.id, undefined, "write")
  if (!account.ok) return account.response

  const guard = await requireNoahVerificationApproved(
    account.ctx.subjectUserId,
    account.ctx.scope,
    account.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const body = (await request.json().catch(() => null)) as TransferRequest | null
  const amount = Number.parseFloat(String(body?.amount ?? "").trim())
  const receiveCurrency = String(body?.currency || "").trim().toUpperCase()
  const countryCode = String(body?.countryCode || "").trim().toUpperCase()
  const recipientId = String(body?.recipientId || "").trim()
  const channelId = String(body?.channelId || "").trim()
  const idempotencyKey = String(
    body?.idempotencyKey ||
      body?.reservedDebitEtid ||
      request.headers.get("idempotency-key") ||
      "",
  ).trim()

  if (
    !recipientId ||
    !countryCode ||
    !/^[A-Z]{3}$/.test(receiveCurrency) ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid transfer fields. Required: amount, fiat ISO 4217 currency, countryCode, recipientId.",
      },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  const { data: recipient } = await admin
    .from("recipients")
    .select("*")
    .eq("id", recipientId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
  }

  const bankLabel = String(recipient.bank_name || "").toLowerCase()
  if (
    recipient.wallet_network ||
    bankLabel.includes("easetag") ||
    bankLabel.includes("easenet")
  ) {
    return NextResponse.json(
      {
        error:
          "Wallet and Easetag recipients cannot use balance Global Payout. Choose a bank or mobile money recipient.",
      },
      { status: 400 },
    )
  }

  const gateRow = {
    country_code: String(recipient.country_code || countryCode).toUpperCase(),
    currency: String(recipient.currency || receiveCurrency).toUpperCase(),
    bank_name: recipient.bank_name,
    mobile_provider: recipient.mobile_provider,
    wallet_network: recipient.wallet_network,
  }
  const corridorError = await payoutCorridorGate(admin, gateRow, {
    requireExecutableProviderChannel: requireExecutableProviderChannel(),
  })
  if (corridorError) return corridorError

  let provider = String(body?.payoutProvider || "").toLowerCase()
  if (!["noah", "yellowcard", "grid"].includes(provider)) {
    try {
      const route = await selectProviderForCorridor(admin, {
        countryCode,
        currencyCode: receiveCurrency,
        mobileProvider: recipient.mobile_provider,
        bankName: recipient.bank_name,
        rail: recipient.mobile_provider ? "mobile_money" : "bank_transfer",
        businessId: noahContext.scope === "business" ? noahContext.businessId : null,
        userId: user.id,
      })
      provider = route.id
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Payouts to this country and currency are not available on the configured provider."
      return NextResponse.json(
        { error: msg, code: "PAYOUT_PROVIDER_UNAVAILABLE" },
        { status: 400 },
      )
    }
  }

  const envGate = requirePayoutProviderEnv(
    provider === "yellowcard" || provider === "grid" ? provider : "noah",
  )
  if (envGate) return envGate

  const businessId =
    noahContext.scope === "business" ? noahContext.businessId : null
  const organizationOwner =
    businessId
      ? await resolveBusinessOrgOwnerUserId(admin, businessId).catch(() => null)
      : null
  const transactionUserId = organizationOwner ?? user.id
  const cryptoCurrency = String(
    body?.cryptoCurrency || getNoahSettlementCryptoCurrency(),
  ).toUpperCase()
  const sourceCurrency = cryptoCurrency.startsWith("EUR") ? "EUR" : "USD"
  const destination = sendDestinationFromRow(
    { ...recipient, id: recipientId },
    "recipient",
  )

  try {
    const result = await executeSendDestination(
      {
        admin,
        accountContext: account.ctx,
        userId: transactionUserId,
        businessId,
        sourceCurrency,
        noahCustomerId: noahContext.noahCustomerId,
      },
      {
        destination,
        amount,
        amountEntryMode: "receive",
        purpose: String(body?.paymentPurpose || "").trim() || undefined,
        note: String(body?.note || "").trim() || undefined,
        idempotencyKey,
        reviewSnapshot:
          normalizePayoutReviewSnapshot(body?.reviewSnapshot) ?? undefined,
        locked: {
          lockId: String(body?.lockId || "").trim() || null,
          sourceAmount: Number(body?.totalDebited ?? amount),
          payload: {
            kind: "fiat_payout",
            destinationRef: destination.destinationRef,
            receiveAmount: amount,
            receiveCurrency,
            countryCode,
            payoutProvider: provider,
            channelId,
            lockId: body?.lockId,
            formSessionId: body?.formSessionId,
            cryptoAuthorizedAmount: body?.cryptoAuthorizedAmount,
            totalDebited: body?.totalDebited,
            marginAmount: body?.marginAmount,
            processingFee: body?.processingFee,
            channelCost: body?.channelCost,
            customerPrincipal: body?.customerPrincipal,
            customerRate: body?.customerRate,
            noahFloor: body?.noahFloor,
            noahSendAmount: body?.noahSendAmount,
            marginCaptureMode: body?.marginCaptureMode,
            noahMid: body?.noahMid,
            ycSequenceId: body?.ycSequenceId,
            ycSendId: body?.ycSendId,
            ycWalletAddress: body?.ycWalletAddress,
            ycCryptoAmount: body?.ycCryptoAmount,
            gridQuoteId: body?.gridQuoteId,
            gridFundingAddress: body?.gridFundingAddress,
            gridCryptoAmount: body?.gridCryptoAmount,
            gridCustomerId: body?.gridCustomerId,
            gridExternalAccountId: body?.gridExternalAccountId,
          },
        },
      },
    )

    if (result.state === "failed") {
      if (result.message === "insufficient_balance") {
        return NextResponse.json(
          { error: "Insufficient balance for this payout." },
          { status: 400 },
        )
      }
      if (result.message === "YC_QUOTE_EXPIRED") {
        return NextResponse.json(
          { error: "Payout quote expired. Go back and review again.", code: "YC_QUOTE_EXPIRED" },
          { status: 409 },
        )
      }
      throw new Error(result.message)
    }

    return NextResponse.json({
      id: result.transactionId,
      transaction_id: result.transactionId,
      easner_transaction_id: result.transactionId,
      amount: amount.toFixed(2),
      currency: receiveCurrency.toLowerCase(),
      status: result.state === "settled" ? "completed" : "pending",
      provider,
    })
  } catch (cause) {
    logNoahPayoutFailure("transfers_offramp", cause, {
      recipientId,
      countryCode,
      fiatCurrency: receiveCurrency,
      fiatAmount: amount,
      userId: user.id,
      scope: noahContext.scope,
    })
    return NextResponse.json(
      { error: mapNoahPayoutUserError(cause, "sell") },
      { status: 400 },
    )
  }
}
