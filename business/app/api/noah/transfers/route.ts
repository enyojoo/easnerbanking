import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { requireAuth, requireNoahEnv, resolveNoahContextAsync } from "../_helpers"
import { noahFetch } from "@/lib/noah/http"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getNoahSettlementCryptoCurrency } from "@/lib/noah/config"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { payoutCorridorGate, requireExecutableProviderChannel } from "@/lib/payout-corridor-validation"
import { mapNoahPrepareError } from "@/lib/noah/noah-prepare-errors"

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
        destinationExternalAccountId?: string
        formSessionId?: string
        cryptoAuthorizedAmount?: string
        cryptoCurrency?: string
        countryCode?: string
        channelId?: string
        recipientId?: string
        note?: string
      }
    | null

  const sourceWalletId = String(body?.sourceWalletId || "").trim()
  const destinationExternalAccountId = String(body?.destinationExternalAccountId || "").trim()
  const formSessionId = String(body?.formSessionId || "").trim()
  const cryptoAuthorizedAmount = String(body?.cryptoAuthorizedAmount || "").trim()
  const cryptoCurrencyRaw = String(body?.cryptoCurrency || getNoahSettlementCryptoCurrency()).trim()
  const amountRaw = String(body?.amount ?? "").trim()
  const currencyRaw = String(body?.currency || "").trim().toUpperCase()
  const isIsoFiat = /^[A-Z]{3}$/.test(currencyRaw)
  /** Form-session sell supports any fiat returned by the prepared channel (e.g. KES, GHS). */
  const fiatCurrency = isIsoFiat ? currencyRaw : ""
  /** External-account sell path remains USD/EUR until expanded. */
  const externalFiatOk = currencyRaw === "USD" || currencyRaw === "EUR"
  const amount = Number.parseFloat(amountRaw)

  const isFormSessionSell =
    Boolean(formSessionId) &&
    Boolean(cryptoAuthorizedAmount) &&
    Boolean(fiatCurrency) &&
    Number.isFinite(amount) &&
    amount > 0

  const countryCode = String(body?.countryCode || "").trim().toUpperCase()
  const channelId = String(body?.channelId || "").trim()
  const recipientId = String(body?.recipientId || "").trim()
  const sendNote = typeof body?.note === "string" ? body.note.trim() : ""

  if (isFormSessionSell) {
    if (!countryCode) {
      return NextResponse.json(
        { error: "countryCode is required for Global Payout (form-session sell)." },
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
  }

  if (
    !isFormSessionSell &&
    (!sourceWalletId ||
      !destinationExternalAccountId ||
      !externalFiatOk ||
      !Number.isFinite(amount) ||
      amount <= 0)
  ) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid transfer fields. Either (sourceWalletId, destinationExternalAccountId, amount, currency USD|EUR) or (formSessionId, cryptoAuthorizedAmount, amount, fiat ISO 4217 code, cryptoCurrency).",
      },
      { status: 400 }
    )
  }

  let sellPayloadPascal: Record<string, unknown>
  let sellPayloadCamel: Record<string, unknown>
  let metadataExtra: Record<string, unknown> = {}

  if (isFormSessionSell) {
    sellPayloadPascal = {
      CustomerID: noahCtx.noahCustomerId,
      CryptoCurrency: cryptoCurrencyRaw,
      FiatAmount: amount.toFixed(2),
      CryptoAuthorizedAmount: cryptoAuthorizedAmount,
      FormSessionID: formSessionId,
      Nonce: randomUUID(),
    }
    sellPayloadCamel = {
      customerId: noahCtx.noahCustomerId,
      cryptoCurrency: cryptoCurrencyRaw,
      fiatAmount: amount.toFixed(2),
      cryptoAuthorizedAmount: cryptoAuthorizedAmount,
      formSessionId,
      nonce: randomUUID(),
    }
    metadataExtra = {
      formSessionId,
      cryptoCurrency: cryptoCurrencyRaw,
      fiatCurrency,
      sellMode: "form_session",
      country_code: countryCode || null,
      ...(channelId ? { channel_id: channelId } : {}),
      ...(recipientId ? { recipient_id: recipientId } : {}),
      ...(sendNote ? { send_note: sendNote } : {}),
    }
  } else {
    sellPayloadPascal = {
      CustomerID: noahCtx.noahCustomerId,
      SourceWalletID: sourceWalletId,
      DestinationExternalAccountID: destinationExternalAccountId,
      FiatCurrency: currencyRaw,
      Amount: amount.toFixed(2),
    }
    sellPayloadCamel = {
      customerId: noahCtx.noahCustomerId,
      sourceWalletId,
      destinationExternalAccountId,
      fiatCurrency: currencyRaw,
      amount: amount.toFixed(2),
    }
    metadataExtra = { destinationExternalAccountId, sellMode: "external_account" }
  }

  try {
    let tx: Record<string, unknown>
    try {
      tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path: "/transactions/sell",
        json: sellPayloadPascal,
      })
    } catch {
      tx = await noahFetch<Record<string, unknown>>({
        method: "POST",
        path: "/transactions/sell",
        json: sellPayloadCamel,
      })
    }

    const id = String(tx.ID ?? tx.id ?? "")
    const status = String(tx.Status ?? tx.status ?? "pending").toLowerCase()
    if (isFormSessionSell) {
      console.info("[noah_global_payout]", {
        country: countryCode,
        fiat: fiatCurrency,
        channelId: channelId || null,
        formSessionId,
        providerTransactionId: id,
        sellMode: "form_session",
      })
    }
    const { amount: txAmount, currency } = pickTxAmountAndCurrency(tx)
    const admin = createSupabaseAdmin()
    let txUserId = user.id
    const businessId = noahCtx.businessId
    if (noahCtx.scope === "business" && noahCtx.businessId) {
      const owner = await resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId)
      if (owner) txUserId = owner
    }
    await upsertLedgerTransaction(admin, {
      userId: txUserId,
      businessId,
      provider: "noah",
      providerTransactionId: id,
      status,
      amount: txAmount || amount,
      currency: currency || (isFormSessionSell ? fiatCurrency : currencyRaw),
      direction: "out",
      payload: tx,
      metadata: {
        sourceWalletId: sourceWalletId || null,
        destinationExternalAccountId: destinationExternalAccountId || null,
        ...metadataExtra,
        source: "api_noah_transfers",
      },
      occurredAt: String(tx.Created ?? tx.Updated ?? new Date().toISOString()),
      settledAt: status === "settled" ? String(tx.Updated ?? tx.Created ?? new Date().toISOString()) : null,
      txHash: String(tx.TxHash ?? tx.TransactionHash ?? "").trim() || null,
      baseCurrency: currency || (isFormSessionSell ? fiatCurrency : currencyRaw),
    })

    return NextResponse.json({
      id: id || "",
      transaction_id: id || "",
      amount: String(txAmount || amount),
      currency: String(currency || (isFormSessionSell ? fiatCurrency : currencyRaw)).toLowerCase(),
      status,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: mapNoahPrepareError(e) }, { status: 400 })
  }
}
