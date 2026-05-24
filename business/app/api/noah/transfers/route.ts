import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { noahFetch } from "@/lib/noah/http"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import {
  pickNoahGlobalPayoutLedgerFields,
  isNoahGlobalPayoutSellTx,
  settlementWalletCurrencyForNoahCrypto,
} from "@/lib/noah/global-payout-ledger"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getNoahSettlementCryptoCurrency } from "@/lib/noah/config"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { payoutCorridorGate, requireExecutableProviderChannel } from "@/lib/payout-corridor-validation"
import { mapNoahPayoutUserError } from "@/lib/noah/noah-prepare-errors"
import { logNoahPayoutFailure } from "@/lib/noah/log-noah-payout-failure"
import { NoahHttpError } from "@/lib/noah/http"
import {
  prepareSellFromRecipientRow,
  type RecipientSellPrepareRow,
} from "@/lib/terminal/recipient-sell-prepare"
import { parseNoahFormNextStep } from "@/lib/noah/finalize-sell-form-session"

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth
  const noahCtx = await resolveNoahContextAsync(user.id, request)
  if (!noahCtx.ok) return noahCtx.response

  const body = (await request.json().catch(() => null)) as
    | {
        amount?: string | number
        currency?: string
        sourceWalletId?: string
        formSessionId?: string
        cryptoAuthorizedAmount?: string
        cryptoCurrency?: string
        countryCode?: string
        channelId?: string
        recipientId?: string
        note?: string
        paymentPurpose?: string
      }
    | null

  const sourceWalletId = String(body?.sourceWalletId || "").trim()
  let formSessionId = String(body?.formSessionId || "").trim()
  let cryptoAuthorizedAmount = String(body?.cryptoAuthorizedAmount || "").trim()
  const cryptoCurrencyRaw = String(body?.cryptoCurrency || getNoahSettlementCryptoCurrency()).trim()
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

  const isFormSessionSell =
    Boolean(formSessionId) &&
    Boolean(cryptoAuthorizedAmount) &&
    Boolean(fiatCurrency) &&
    Boolean(countryCode) &&
    Boolean(sourceWalletId) &&
    Number.isFinite(amount) &&
    amount > 0

  if (!isFormSessionSell) {
    console.warn("[noah_payout]", {
      stage: "transfers_validation",
      userId: user.id,
      scope: noahCtx.scope,
      hasSourceWalletId: Boolean(sourceWalletId),
      hasFormSessionId: Boolean(formSessionId),
      hasCryptoAuthorizedAmount: Boolean(cryptoAuthorizedAmount),
      fiatCurrency,
      countryCode,
      amount,
    })
    return NextResponse.json(
      {
        error:
          "Missing or invalid transfer fields. Required: sourceWalletId, formSessionId, cryptoAuthorizedAmount, amount, fiat ISO 4217 currency, cryptoCurrency, countryCode.",
      },
      { status: 400 },
    )
  }

  const admin = createSupabaseAdmin()
  let gateRow: {
    country_code: string
    currency: string
    bank_name?: string | null
    mobile_provider?: string | null
    wallet_network?: string | null
    payee_easetag?: string | null
  } = {
    country_code: countryCode,
    currency: fiatCurrency,
    bank_name: "Bank transfer",
  }
  if (recipientId) {
    const { data: rec } = await admin
      .from("recipients")
      .select("country_code,currency,bank_name,mobile_provider,wallet_network,payee_easetag")
      .eq("id", recipientId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (rec) {
      gateRow = {
        country_code: String(rec.country_code || countryCode).toUpperCase(),
        currency: String(rec.currency || fiatCurrency).toUpperCase(),
        bank_name: rec.bank_name,
        mobile_provider: rec.mobile_provider,
        wallet_network: rec.wallet_network,
        payee_easetag: rec.payee_easetag,
      }
      if (gateRow.wallet_network || gateRow.payee_easetag) {
        return NextResponse.json(
          {
            error:
              "Wallet and Easetag recipients cannot use balance Global Payout. Choose a bank or mobile money recipient.",
          },
          { status: 400 },
        )
      }
    }
  }
  const gate = await payoutCorridorGate(admin, gateRow, {
    requireExecutableNoahChannel: requireExecutableProviderChannel(),
  })
  if (gate) return gate

  /** Fresh prepare immediately before sell — quote FormSessionIDs go stale after PIN / delay. */
  if (recipientId) {
    const { data: rec } = await admin
      .from("recipients")
      .select("*")
      .eq("id", recipientId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!rec) {
      return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
    }
    try {
      const prepared = await prepareSellFromRecipientRow({
        row: rec as RecipientSellPrepareRow,
        fiatAmount: amount,
        cryptoCurrency: cryptoCurrencyRaw,
        noahCustomerId: noahCtx.noahCustomerId,
        // Noah `DelayedSell` is a flag on the original prepare ("defer balance check"), not a separate commit phase.
        // After Cob ack clears NextStep, go straight to POST /transactions/sell.
        commitForExecution: false,
        overrides:
          sendNote || sendPaymentPurpose
            ? {
                ...(sendNote ? { note: sendNote } : {}),
                ...(sendPaymentPurpose ? { paymentPurpose: sendPaymentPurpose } : {}),
              }
            : undefined,
      })
      formSessionId = String(prepared.prep.formSessionId || "").trim()
      cryptoAuthorizedAmount = String(prepared.prep.cryptoAuthorizedAmount || "").trim()
      if (!formSessionId || !cryptoAuthorizedAmount) {
        return NextResponse.json(
          { error: "Could not prepare payout session. Go back and get a fresh quote." },
          { status: 400 },
        )
      }
      console.info("[noah_payout]", {
        stage: "transfers_prepare_ok",
        recipientId,
        formSessionIdPrefix: formSessionId.slice(0, 12),
        cryptoAuthorizedAmount,
        formSessionComplete:
          prepared.prep.raw.FormSessionComplete ?? prepared.prep.raw.formSessionComplete ?? null,
        hasNextStep: Boolean(parseNoahFormNextStep(prepared.prep.raw)),
      })
    } catch (e) {
      logNoahPayoutFailure("transfers_prepare", e, {
        recipientId,
        countryCode,
        fiatCurrency,
        fiatAmount: amount,
        cryptoCurrency: cryptoCurrencyRaw,
        userId: user.id,
        scope: noahCtx.scope,
      })
      return NextResponse.json(
        { error: mapNoahPayoutUserError(e, "prepare") },
        { status: 400 },
      )
    }
  }

  /** Noah sell schema: CryptoCurrency, FiatAmount, CryptoAuthorizedAmount, FormSessionID, Nonce only (`additionalProperties: false`). */
  const sellNonce = randomUUID()
  const sellPayloadPascal = {
    CryptoCurrency: cryptoCurrencyRaw,
    FiatAmount: amount.toFixed(2),
    CryptoAuthorizedAmount: cryptoAuthorizedAmount,
    FormSessionID: formSessionId,
    Nonce: sellNonce,
  }
  const sellPayloadCamel = {
    cryptoCurrency: cryptoCurrencyRaw,
    fiatAmount: amount.toFixed(2),
    cryptoAuthorizedAmount: cryptoAuthorizedAmount,
    formSessionId,
    nonce: sellNonce,
  }
  const sellLogMeta = {
    recipientId: recipientId || null,
    countryCode,
    fiatCurrency,
    fiatAmount: amount.toFixed(2),
    cryptoCurrency: cryptoCurrencyRaw,
    cryptoAuthorizedAmount,
    formSessionIdPrefix: formSessionId.slice(0, 12),
    channelId: channelId || null,
    userId: user.id,
    scope: noahCtx.scope,
  }
  const metadataExtra = {
    formSessionId,
    cryptoCurrency: cryptoCurrencyRaw,
    fiatCurrency,
    sellMode: "form_session",
    country_code: countryCode,
    ...(channelId ? { channel_id: channelId } : {}),
    ...(recipientId ? { recipient_id: recipientId } : {}),
    ...(sendNote ? { send_note: sendNote } : {}),
  }

  try {
    let tx: Record<string, unknown>
    try {
      tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path: "/transactions/sell",
        json: sellPayloadPascal,
      })
    } catch (sellPascalErr) {
      logNoahPayoutFailure("transfers_sell_pascal", sellPascalErr, sellLogMeta)
      try {
        tx = await noahFetch<Record<string, unknown>>({
          method: "POST",
          path: "/transactions/sell",
          json: sellPayloadCamel,
        })
      } catch (sellCamelErr) {
        logNoahPayoutFailure("transfers_sell_camel", sellCamelErr, sellLogMeta)
        throw sellCamelErr instanceof NoahHttpError ? sellCamelErr : sellPascalErr
      }
    }

    const id = String(tx.ID ?? tx.id ?? "")
    const status = String(tx.Status ?? tx.status ?? "pending").toLowerCase()
    console.info("[noah_global_payout]", {
      country: countryCode,
      fiat: fiatCurrency,
      channelId: channelId || null,
      formSessionId,
      providerTransactionId: id,
      sellMode: "form_session",
    })
    const { amount: txAmount, currency } = pickTxAmountAndCurrency(tx)
    let txUserId = user.id
    const businessId = noahCtx.businessId
    if (noahCtx.scope === "business" && noahCtx.businessId) {
      const owner = await resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId)
      if (owner) txUserId = owner
    }
    const walletCurrency = settlementWalletCurrencyForNoahCrypto(cryptoCurrencyRaw)
    const ledger = pickNoahGlobalPayoutLedgerFields(tx, {
      cryptoAuthorizedAmount,
      sourceBalanceCurrency: walletCurrency,
    })
    const ledgerAmount =
      ledger.amount > 0
        ? ledger.amount
        : Math.abs(parseFloat(cryptoAuthorizedAmount) || 0) || txAmount || amount

    await upsertLedgerTransaction(admin, {
      userId: txUserId,
      businessId,
      provider: "noah",
      providerTransactionId: id,
      status,
      amount: ledgerAmount,
      currency: ledger.currency || walletCurrency,
      direction: "out",
      payload: tx,
      metadata: {
        sourceWalletId,
        ...metadataExtra,
        source: "api_noah_transfers",
        payout_type: "global_fiat",
        receive_amount: ledger.receiveAmount || amount,
        receive_currency: ledger.receiveCurrency || fiatCurrency,
        crypto_authorized_amount: cryptoAuthorizedAmount,
        crypto_asset: ledger.asset ?? cryptoCurrencyRaw,
      },
      occurredAt: String(tx.Created ?? tx.Updated ?? new Date().toISOString()),
      settledAt: status === "settled" ? String(tx.Updated ?? tx.Created ?? new Date().toISOString()) : null,
      txHash: String(tx.TxHash ?? tx.TransactionHash ?? "").trim() || null,
      asset: ledger.asset ?? cryptoCurrencyRaw,
      baseCurrency: ledger.baseCurrency || walletCurrency,
    })

    return NextResponse.json({
      id: id || "",
      transaction_id: id || "",
      amount: String(txAmount || amount),
      currency: String(currency || fiatCurrency).toLowerCase(),
      status,
    })
  } catch (e: unknown) {
    logNoahPayoutFailure("transfers_sell", e, sellLogMeta)
    return NextResponse.json(
      { error: mapNoahPayoutUserError(e, "sell") },
      { status: 400 },
    )
  }
}
