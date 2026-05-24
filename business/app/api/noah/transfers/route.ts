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
  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response
  const noahCtx = noahCtxResult

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

  // Single recipient fetch (was 2x); derive both the corridor gate row and the
  // sell-prepare row from one query so we save one round-trip to Postgres.
  let recipientRow: RecipientSellPrepareRow | null = null
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
      .select("*")
      .eq("id", recipientId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (!rec) {
      return NextResponse.json({ error: "Recipient not found." }, { status: 404 })
    }
    recipientRow = rec as RecipientSellPrepareRow
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
  const gate = await payoutCorridorGate(admin, gateRow, {
    requireExecutableNoahChannel: requireExecutableProviderChannel(),
  })
  if (gate) return gate

  /**
   * Performance: try POST /transactions/sell with the FormSessionID the client already
   * received from the on-screen quote. If Noah accepts it, we skip the second prepare
   * (saves 2–4s on the PIN→send round-trip). If it 404s ("not found" on RDS) the session
   * has expired and we transparently re-prepare below.
   */

  async function freshPrepare(): Promise<void> {
    if (!recipientRow) return
    const prepared = await prepareSellFromRecipientRow({
      row: recipientRow,
      fiatAmount: amount,
      cryptoCurrency: cryptoCurrencyRaw,
      noahCustomerId: noahCtx.noahCustomerId,
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
      throw new Error("Could not prepare payout session. Go back and get a fresh quote.")
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
  }

  function buildSellPayloads() {
    const sellNonce = randomUUID()
    return {
      pascal: {
        CryptoCurrency: cryptoCurrencyRaw,
        FiatAmount: amount.toFixed(2),
        CryptoAuthorizedAmount: cryptoAuthorizedAmount,
        FormSessionID: formSessionId,
        Nonce: sellNonce,
      },
      camel: {
        cryptoCurrency: cryptoCurrencyRaw,
        fiatAmount: amount.toFixed(2),
        cryptoAuthorizedAmount: cryptoAuthorizedAmount,
        formSessionId,
        nonce: sellNonce,
      },
    }
  }

  /** Returns Noah tx, or null if Noah responded 404/expired (caller re-prepares). */
  async function attemptSell(allowFallback: boolean): Promise<Record<string, unknown> | null> {
    const { pascal, camel } = buildSellPayloads()
    try {
      return await noahFetch<Record<string, unknown>>({
        method: "POST",
        path: "/transactions/sell",
        json: pascal,
      })
    } catch (pascalErr) {
      const isExpired =
        pascalErr instanceof NoahHttpError &&
        (pascalErr.status === 404 ||
          /not\s*found|resourcenotfound|expired/i.test(
            String(pascalErr.detail ?? pascalErr.message ?? ""),
          ))
      if (isExpired && allowFallback) return null
      logNoahPayoutFailure("transfers_sell_pascal", pascalErr, sellLogMeta())
      try {
        return await noahFetch<Record<string, unknown>>({
          method: "POST",
          path: "/transactions/sell",
          json: camel,
        })
      } catch (camelErr) {
        const isExpiredCamel =
          camelErr instanceof NoahHttpError &&
          (camelErr.status === 404 ||
            /not\s*found|resourcenotfound|expired/i.test(
              String(camelErr.detail ?? camelErr.message ?? ""),
            ))
        if (isExpiredCamel && allowFallback) return null
        logNoahPayoutFailure("transfers_sell_camel", camelErr, sellLogMeta())
        throw camelErr instanceof NoahHttpError ? camelErr : pascalErr
      }
    }
  }

  function sellLogMeta() {
    return {
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
  }

  // Kick off the business-org owner lookup in parallel with the Noah sell call so the
  // ledger upsert below does not pay for it serially. Falls back to the auth user id.
  const ownerLookupPromise =
    noahCtx.scope === "business" && noahCtx.businessId
      ? resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId).catch(() => null)
      : Promise.resolve(null)

  try {
    // Fast path: client-supplied FormSessionID + CryptoAuthorizedAmount from the on-screen
    // quote. ~70%+ of the time this is still alive on Noah's side and we save 2–4s of prepare.
    let tx: Record<string, unknown> | null = await attemptSell(Boolean(recipientRow))

    if (!tx) {
      console.info("[noah_payout]", {
        stage: "transfers_sell_session_expired_refresh",
        recipientId: recipientId || null,
        formSessionIdPrefix: formSessionId.slice(0, 12),
      })
      try {
        await freshPrepare()
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
      tx = await attemptSell(false)
      if (!tx) {
        return NextResponse.json(
          { error: "Could not complete sell after refreshing the quote." },
          { status: 400 },
        )
      }
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
    const businessId = noahCtx.businessId
    const orgOwner = await ownerLookupPromise
    const txUserId = orgOwner ?? user.id
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
    logNoahPayoutFailure("transfers_sell", e, sellLogMeta())
    return NextResponse.json(
      { error: mapNoahPayoutUserError(e, "sell") },
      { status: 400 },
    )
  }
}
