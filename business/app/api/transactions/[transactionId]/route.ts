import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import {
  enrichMobileDetailFromLedgerMetadata,
  mapNoahTransactionToMobileDetail,
} from "@/lib/noah/map-transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"
import {
  displayEasnerTransactionId,
  looksLikeUuidParam,
  normalizeEasnerTransactionIdForLookup,
} from "@/lib/easner-transaction-id"
import { mapRowToBusinessTransaction } from "@/lib/transactions/map-row-to-business"
import {
  attachBankDepositDetailFieldsAsync,
  isBankOnrampPayInRow,
} from "@/lib/transactions/bank-deposit-detail"
import {
  attachGlobalPayoutDetailFieldsAsync,
  isGlobalPayoutOffRampRow,
} from "@/lib/transactions/global-payout-detail"
import {
  isTurnkeyNoahBankOnrampChainMirror,
  isTurnkeyTransactionHiddenFromFeed,
} from "@/lib/transactions/transaction-feed-filters"
import { collectNoahBankOnrampOnChainTxHashesForScope } from "@/lib/noah/noah-bank-onramp-chain-suppression"
import {
  deriveEasnerInboundRemitterDisplayName,
  formatTransactionDetailHeroTitle,
  isEasnerProductReceiveTitle,
  toEasnerTransactionPrimaryLabel,
  toEasnerTransactionProductCategory,
} from "@easner/shared"
import { enrichBankDepositLedgerRows } from "@/lib/transactions/enrich-bank-deposit-ledger-rows"
import { resolveGlobalPayoutOffRampDetail } from "@/lib/transactions/resolve-global-payout-off-ramp"

const LEDGER_SELECT =
  "id, easner_transaction_id, provider, provider_transaction_id, status, amount, currency, direction, metadata, payload, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, counterparty_address, asset, chain, base_currency, base_amount"

function mapLedgerRowToMobileItem(row: Record<string, unknown>): Record<string, unknown> {
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const transaction_type = dirRaw === "in" ? "receive" : "send"
  const st = String(row.status ?? "").toLowerCase()
  const status =
    st === "settled" ? "completed"
    : st === "pending" || st === "processing" ? st
    : st === "failed" || st === "cancelled" ? "failed"
    : st === "unknown" ? "pending"
    : st || "unknown"
  const created =
    row.occurred_at != null ? String(row.occurred_at) : row.created_at != null ? String(row.created_at) : new Date().toISOString()
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : ""
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const easnerId = displayEasnerTransactionId({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  const ledgerId = row.id != null ? String(row.id) : ""
  const idForUi = easnerId || providerTxId || ledgerId
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const currency = String(row.currency ?? "USD")
  const ledger_row_id = ledgerId || undefined
  const metaForName = row.metadata as Record<string, unknown> | null | undefined
  const payloadForName = row.payload as Record<string, unknown> | null | undefined
  const name =
    deriveEasnerInboundRemitterDisplayName({
      metadata: metaForName,
      payload: payloadForName,
    }) ??
    toEasnerTransactionPrimaryLabel({
      provider: String(row.provider ?? "noah"),
      direction: dirRaw === "in" ? "in" : "out",
      metadata: metaForName ?? null,
      payload: payloadForName,
    })
  return {
    id: idForUi,
    transaction_id: idForUi,
    ledger_row_id,
    type: transaction_type,
    transaction_type,
    amount,
    currency,
    status,
    created_at: created,
    noah_created_at: created,
    name,
    direction: dirRaw === "in" ? "credit" : "debit",
    source_type: undefined,
    metadata: row.metadata,
  }
}

function mapLedgerRowToMobileDetail(row: Record<string, unknown>): Record<string, unknown> {
  const base = mapLedgerRowToMobileItem(row)
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : ""
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const easnerId = displayEasnerTransactionId({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const st = String(row.status ?? "").toLowerCase()
  const provider = String(row.provider ?? "noah").toLowerCase()
  const created =
    row.occurred_at != null ? String(row.occurred_at) : row.created_at != null ? String(row.created_at) : new Date().toISOString()
  const isEasetagP2p = String(meta?.source ?? "").toLowerCase() === "easetag_p2p"
  const sourceType =
    isEasetagP2p
      ? "easetag_p2p"
      : provider === "turnkey"
        ? "liquidation_address"
        : String(meta?.source_type ?? meta?.collection_channel ?? "virtual_account")
  const referenceFromMeta =
    typeof meta?.reference === "string" && meta.reference.trim() ? meta.reference.trim() : undefined
  const sourcePaymentRail =
    isEasetagP2p
      ? "easetag"
      : String(meta?.payment_rail ?? meta?.source_payment_rail ?? row.chain ?? "ach").toLowerCase()
  const destinationPaymentRail =
    isEasetagP2p
      ? "easetag"
      : String(meta?.destination_payment_rail ?? (dirRaw === "in" ? "bank" : provider === "turnkey" ? "crypto" : "bank")).toLowerCase()
  const recipientName =
    String(meta?.counterparty_name ?? (meta?.recipient_name as string | undefined) ?? "").trim() || undefined
  const reference =
    referenceFromMeta ||
    String(meta?.narration ?? "").trim() ||
    undefined
  const payload = row.payload as Record<string, unknown> | null | undefined
  const transaction_product = toEasnerTransactionProductCategory({
    provider: String(row.provider ?? "noah"),
    direction: dirRaw === "in" ? "in" : "out",
    metadata: meta ?? null,
    payload,
  })
  const sender_display_name =
    dirRaw === "in" &&
    (transaction_product === "Bank Deposit" || transaction_product === "Verification deposit")
      ? deriveEasnerInboundRemitterDisplayName({ metadata: meta, payload }) ||
        (typeof meta?.verification_bank_name === "string" && meta.verification_bank_name.trim()
          ? meta.verification_bank_name.trim()
          : typeof meta?.sender_name === "string"
            ? meta.sender_name.trim()
            : undefined) ||
        undefined
      : undefined
  const feeAmount =
    typeof meta?.fee_amount === "number" && Number.isFinite(meta.fee_amount) ? meta.fee_amount : undefined
  const settledAmount =
    typeof meta?.settled_amount === "number" && Number.isFinite(meta.settled_amount)
      ? meta.settled_amount
      : undefined
  const settledCurrency =
    meta?.settled_currency != null
      ? String(meta.settled_currency)
      : meta?.fiat_deposit_currency != null
        ? String(meta.fiat_deposit_currency)
        : base.currency
  return {
    ...base,
    transaction_product,
    sender_display_name,
    noah_transaction_id: easnerId || undefined,
    final_amount: settledAmount ?? base.amount,
    ...(feeAmount != null ? { fee_amount: feeAmount } : {}),
    ...(settledAmount != null
      ? {
          settled_amount: settledAmount,
          settled_currency: settledCurrency,
          receipt_final_amount: settledAmount,
        }
      : {}),
    updated_at: row.updated_at != null ? String(row.updated_at) : created,
    completed_at: row.settled_at != null ? String(row.settled_at) : st === "settled" ? created : undefined,
    tx_hash: row.tx_hash != null ? String(row.tx_hash) : undefined,
    base_amount: typeof row.base_amount === "number" ? row.base_amount : Number(row.base_amount) || undefined,
    base_currency: row.base_currency != null ? String(row.base_currency) : undefined,
    source_type: sourceType,
    source_payment_rail: sourcePaymentRail,
    destination_payment_rail: destinationPaymentRail,
    recipient_name: recipientName,
    reference,
    metadata: {
      ...(meta || {}),
      tx_hash: row.tx_hash ?? null,
      wallet_address: row.wallet_address ?? null,
      counterparty_address: row.counterparty_address ?? null,
      asset: row.asset ?? null,
      chain: row.chain ?? null,
    },
  }
}

type Props = { params: Promise<{ transactionId: string }> }

export async function GET(request: Request, routeCtx: Props) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const { transactionId: rawId } = await routeCtx.params
  const transactionIdRaw = rawId?.trim()
  if (!transactionIdRaw) {
    return NextResponse.json({ error: "Missing transaction id" }, { status: 400 })
  }

  /** Accept `/transactions/etid55613389` (URL) and `ETID55613389` (display); DB stores uppercase ETID + 8 digits. */
  const normalizedEtid = normalizeEasnerTransactionIdForLookup(transactionIdRaw)
  const transactionId = normalizedEtid ?? transactionIdRaw

  const scopeRes = await resolveLedgerListScope(request, userId)
  if (!scopeRes.ok) return scopeRes.response
  const { scope, businessId } = scopeRes

  const admin = createSupabaseAdmin()

  function fetchOne(filter: { column: string; value: string }) {
    let q = admin
      .from("transactions")
      .select(LEDGER_SELECT)
      .eq(filter.column, filter.value)
    if (scope === "business") {
      q = q.eq("business_id", businessId as string)
    } else {
      q = q.eq("user_id", userId).is("business_id", null)
    }
    return q.maybeSingle()
  }

  let { data: row, error } = await fetchOne({ column: "provider_transaction_id", value: transactionId })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!row) {
    ;({ data: row, error } = await fetchOne({ column: "easner_transaction_id", value: transactionId }))
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }
  if (!row) {
    let q = admin.from("transactions").select(LEDGER_SELECT).contains("metadata", {
      easner_transaction_id: transactionId,
    })
    if (scope === "business") {
      q = q.eq("business_id", businessId as string)
    } else {
      q = q.eq("user_id", userId).is("business_id", null)
    }
    ;({ data: row, error } = await q.maybeSingle())
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }
  if (!row && looksLikeUuidParam(transactionId)) {
    ;({ data: row, error } = await fetchOne({ column: "id", value: transactionId }))
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const rec = row as Record<string, unknown>
  if (isTurnkeyTransactionHiddenFromFeed(rec.metadata, rec.payload)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const txHashForMirror = String(rec.tx_hash ?? "").trim()
  if (
    txHashForMirror &&
    String(rec.provider ?? "").toLowerCase() === "turnkey" &&
    String(rec.direction ?? "").toLowerCase() === "in"
  ) {
    const noahHashes = await collectNoahBankOnrampOnChainTxHashesForScope(admin, [txHashForMirror], {
      userId,
      businessId: scope === "business" ? (businessId as string) : null,
    })
    if (isTurnkeyNoahBankOnrampChainMirror(rec, noahHashes)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  const payload = rec.payload as Record<string, unknown> | null | undefined
  const meta = rec.metadata as Record<string, unknown> | null | undefined
  let transaction = mapLedgerRowToMobileDetail(rec)
  if (payload && typeof payload === "object" && (payload.ID != null || payload.id != null)) {
    const fromNoah = mapNoahTransactionToMobileDetail(payload)
    transaction = enrichMobileDetailFromLedgerMetadata(
      {
        ...fromNoah,
        id: transaction.id,
        transaction_id: transaction.transaction_id,
        ledger_row_id: transaction.ledger_row_id,
      },
      meta,
    )
  } else {
    transaction = enrichMobileDetailFromLedgerMetadata(transaction, meta)
  }

  transaction = await attachBankDepositDetailFieldsAsync(admin, rec, transaction)
  transaction = await attachGlobalPayoutDetailFieldsAsync(admin, rec, transaction)

  if (scope === "business") {
    const [enrichedRec] = await enrichBankDepositLedgerRows(admin, [rec])
    const rowForBusiness = enrichedRec ?? rec
    const enrichedMeta = rowForBusiness.metadata as Record<string, unknown> | undefined
    let businessTransaction = mapRowToBusinessTransaction(rowForBusiness)
    if (isBankOnrampPayInRow(rec)) {
      const senderLabel =
        (typeof transaction.name === "string" && transaction.name.trim()) ||
        (typeof transaction.sender_display_name === "string" &&
          transaction.sender_display_name.trim()) ||
        (typeof enrichedMeta?.sender_name === "string" && enrichedMeta.sender_name.trim()) ||
        ""
      const narrationLabel =
        (typeof transaction.narration === "string" && transaction.narration.trim()) ||
        (typeof enrichedMeta?.deposit_narration === "string" &&
          enrichedMeta.deposit_narration.trim()) ||
        (typeof transaction.reference === "string" &&
        /^sent from /i.test(transaction.reference)
          ? transaction.reference.trim()
          : "") ||
        ""
      const displayDescription =
        senderLabel && !isEasnerProductReceiveTitle(senderLabel)
          ? senderLabel
          : businessTransaction.description
      businessTransaction = {
        ...businessTransaction,
        description: displayDescription,
        displayHeroTitle: formatTransactionDetailHeroTitle({
          direction: "in",
          counterpartyName: displayDescription,
          productFallback: "Bank Deposit",
        }),
        ...(narrationLabel ? { narration: narrationLabel } : {}),
        ...(displayDescription && displayDescription !== businessTransaction.description
          ? { counterpartyName: displayDescription }
          : {}),
        lifecycle: (transaction.lifecycle as typeof businessTransaction.lifecycle) ?? undefined,
        fee:
          typeof transaction.fee_amount === "number"
            ? transaction.fee_amount
            : businessTransaction.fee,
        depositAmount:
          typeof transaction.deposit_amount === "number"
            ? transaction.deposit_amount
            : businessTransaction.amount,
        postedAmount:
          typeof transaction.posted_amount === "number"
            ? transaction.posted_amount
            : typeof transaction.settled_amount === "number"
              ? transaction.settled_amount
              : undefined,
        postedCurrency:
          transaction.posted_currency != null
            ? String(transaction.posted_currency)
            : businessTransaction.displayCurrency,
        reference: businessTransaction.reference,
        paymentScheme:
          typeof transaction.payment_scheme === "string"
            ? transaction.payment_scheme
            : typeof (transaction.metadata as Record<string, unknown> | undefined)
                  ?.deposit_scheme_label === "string"
              ? String(
                  (transaction.metadata as Record<string, unknown>).deposit_scheme_label,
                )
              : "ACH",
      }
    } else if (isGlobalPayoutOffRampRow(rec)) {
      businessTransaction = {
        ...businessTransaction,
        amount:
          typeof transaction.display_amount === "number"
            ? transaction.display_amount
            : businessTransaction.amount,
        displayCurrency:
          typeof transaction.display_currency === "string"
            ? String(transaction.display_currency)
            : businessTransaction.displayCurrency,
        description:
          typeof transaction.display_description === "string"
            ? String(transaction.display_description)
            : businessTransaction.description,
        displayHeroTitle:
          typeof transaction.display_hero_title === "string"
            ? String(transaction.display_hero_title)
            : businessTransaction.displayHeroTitle,
        baseAmount:
          typeof transaction.ledger_amount === "number"
            ? transaction.ledger_amount
            : businessTransaction.baseAmount,
        baseCurrency:
          typeof transaction.ledger_currency === "string"
            ? String(transaction.ledger_currency)
            : businessTransaction.baseCurrency,
        ledgerAmount:
          typeof transaction.ledger_amount === "number"
            ? transaction.ledger_amount
            : businessTransaction.ledgerAmount,
        ledgerCurrency:
          typeof transaction.ledger_currency === "string"
            ? String(transaction.ledger_currency)
            : businessTransaction.ledgerCurrency,
        lifecycle: (transaction.lifecycle as typeof businessTransaction.lifecycle) ?? undefined,
        payoutReview:
          (transaction.payout_review as typeof businessTransaction.payoutReview) ??
          businessTransaction.payoutReview,
        recipientSnapshot:
          (transaction.recipient_snapshot as typeof businessTransaction.recipientSnapshot) ??
          businessTransaction.recipientSnapshot,
        sendNote:
          typeof transaction.send_note === "string"
            ? transaction.send_note
            : businessTransaction.sendNote,
        counterpartyName:
          typeof transaction.display_description === "string"
            ? String(transaction.display_description)
            : businessTransaction.counterpartyName,
      }
    }
    return NextResponse.json({ transaction, businessTransaction })
  }

  return NextResponse.json({ transaction })
}
