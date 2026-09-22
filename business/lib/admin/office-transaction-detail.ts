import type { createSupabaseAdmin } from "@/lib/supabase/admin"
import { OFFICE_LEDGER_DETAIL_SELECT } from "@/lib/ledger/ledger-select"
import {
  looksLikeUuidParam,
  normalizeEasnerTransactionIdForLookup,
} from "@/lib/easner-transaction-id"
import {
  pickCanonicalLedgerDetailRow,
  type LedgerDetailCandidate,
} from "@/lib/transactions/pick-canonical-ledger-row"
import { enrichYcFundBalanceOfficeRows } from "@/lib/admin/enrich-yc-fund-balance-office-rows"
import { enrichOfficeLedgerForUserDisplay } from "@/lib/admin/office-user-visible-transactions"
import type { OfficeLedgerTransaction } from "@/lib/admin/office-load-transactions"
import { mapRowToBusinessTransaction } from "@/lib/transactions/map-row-to-business"
import { enrichYcPayInMetadataFromTransfer } from "@/lib/yellowcard/enrich-yc-pay-in-metadata"
import {
  resolveOfficePayInRail,
  resolveOfficeYcMode,
  type TxRow,
} from "@/lib/admin/office-overview-compute"
import {
  filterRelatedOfficeLedgerLegs,
  officeRelatedLegMatchKeys,
} from "@/lib/admin/office-related-ledger-legs"
import type { TransactionWithSource } from "@/lib/transactions"
import { isOrgTreasuryInboundTitle } from "@easner/shared"

type AdminClient = ReturnType<typeof createSupabaseAdmin>

export function pickOfficeDetailFromCandidates(
  candidates: LedgerDetailCandidate[],
  lookupId?: string | null,
): LedgerDetailCandidate | null {
  const preferred = String(lookupId ?? "").trim()
  if (preferred) {
    const exact = candidates.find((row) => String(row.id) === preferred)
    if (exact) return exact
  }
  return pickCanonicalLedgerDetailRow(candidates)
}

export function readUnsanitizedFailureReason(
  metadata: Record<string, unknown> | null | undefined,
  payload?: Record<string, unknown> | null,
): string | null {
  const bags = [metadata, payload]
  const keys = ["failure_reason", "error_message", "provider_error", "failed_reason", "error"]
  for (const bag of bags) {
    if (!bag) continue
    for (const key of keys) {
      const value = bag[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function splitFullName(fullName: string | null | undefined): { first_name: string; last_name: string } {
  const full = String(fullName || "").trim()
  const parts = full ? full.split(/\s+/) : []
  return {
    first_name: parts[0] || "",
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : "",
  }
}

async function fetchCandidatesByColumn(
  admin: AdminClient,
  column: string,
  value: string,
): Promise<{ rows: Record<string, unknown>[]; error: { message: string } | null }> {
  const { data, error } = await admin
    .from("transactions")
    .select(OFFICE_LEDGER_DETAIL_SELECT)
    .eq(column, value)
  return { rows: (data ?? []) as Record<string, unknown>[], error }
}

async function fetchCandidatesByMetadata(
  admin: AdminClient,
  contains: Record<string, string>,
): Promise<{ rows: Record<string, unknown>[]; error: { message: string } | null }> {
  const { data, error } = await admin
    .from("transactions")
    .select(OFFICE_LEDGER_DETAIL_SELECT)
    .contains("metadata", contains)
  return { rows: (data ?? []) as Record<string, unknown>[], error }
}

export async function lookupOfficeLedgerDetailRow(
  admin: AdminClient,
  rawId: string,
): Promise<{ row: Record<string, unknown> | null; error: { message: string } | null }> {
  const trimmed = String(rawId || "").trim()
  if (!trimmed) return { row: null, error: { message: "Missing transaction id" } }

  const normalizedEtid = normalizeEasnerTransactionIdForLookup(trimmed)
  const lookupId = normalizedEtid ?? trimmed

  if (looksLikeUuidParam(lookupId)) {
    const byId = await fetchCandidatesByColumn(admin, "id", lookupId)
    if (byId.error) return { row: null, error: byId.error }
    const exact = pickOfficeDetailFromCandidates(byId.rows as LedgerDetailCandidate[], lookupId)
    if (exact) return { row: exact as Record<string, unknown>, error: null }
  }

  const byProvider = await fetchCandidatesByColumn(admin, "provider_transaction_id", lookupId)
  if (byProvider.error) return { row: null, error: byProvider.error }
  let picked = pickOfficeDetailFromCandidates(byProvider.rows as LedgerDetailCandidate[])
  if (picked) return { row: picked as Record<string, unknown>, error: null }

  const byEtid = await fetchCandidatesByColumn(admin, "easner_transaction_id", lookupId)
  if (byEtid.error) return { row: null, error: byEtid.error }
  picked = pickOfficeDetailFromCandidates(byEtid.rows as LedgerDetailCandidate[])
  if (picked) return { row: picked as Record<string, unknown>, error: null }

  const byMeta = await fetchCandidatesByMetadata(admin, { easner_transaction_id: lookupId })
  if (byMeta.error) return { row: null, error: byMeta.error }
  picked = pickOfficeDetailFromCandidates(byMeta.rows as LedgerDetailCandidate[])
  return { row: (picked as Record<string, unknown> | null) ?? null, error: null }
}

async function attachProfiles(
  admin: AdminClient,
  row: Record<string, unknown>,
): Promise<OfficeLedgerTransaction> {
  const userId = row.user_id != null ? String(row.user_id) : ""
  const businessId = row.business_id != null ? String(row.business_id) : ""
  let user: OfficeLedgerTransaction["user"] = null
  let business: OfficeLedgerTransaction["business"] = null

  if (userId) {
    const { data } = await admin.from("users").select("id, email, full_name").eq("id", userId).maybeSingle()
    if (data) {
      const names = splitFullName(data.full_name)
      user = {
        email: data.email ?? null,
        full_name: data.full_name ?? null,
        first_name: names.first_name,
        last_name: names.last_name,
      }
    }
  }
  if (businessId) {
    const { data } = await admin.from("businesses").select("id, name").eq("id", businessId).maybeSingle()
    if (data) {
      business = { id: String(data.id), name: data.name ?? null }
    }
  }

  return {
    ...(row as unknown as OfficeLedgerTransaction),
    user,
    business,
  }
}

async function loadRelatedLedgerRows(
  admin: AdminClient,
  canonical: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const keys = officeRelatedLegMatchKeys({
    id: String(canonical.id ?? ""),
    easner_transaction_id:
      canonical.easner_transaction_id != null ? String(canonical.easner_transaction_id) : null,
    provider_transaction_id:
      canonical.provider_transaction_id != null ? String(canonical.provider_transaction_id) : null,
    metadata: asRecord(canonical.metadata),
  })
  const buckets: Record<string, unknown>[] = []
  if (keys.etid) {
    const byCol = await fetchCandidatesByColumn(admin, "easner_transaction_id", keys.etid)
    if (!byCol.error) buckets.push(...byCol.rows)
    const byMeta = await fetchCandidatesByMetadata(admin, { easner_transaction_id: keys.etid })
    if (!byMeta.error) buckets.push(...byMeta.rows)
  }
  if (keys.payoutId) {
    const byPayout = await fetchCandidatesByMetadata(admin, { easner_payout_id: keys.payoutId })
    if (!byPayout.error) buckets.push(...byPayout.rows)
  }
  return filterRelatedOfficeLedgerLegs(String(canonical.id ?? ""), buckets)
}

function inboundReceiveDisplayTitle(mapped: TransactionWithSource): string | null {
  const title = mapped.inboundReceive?.displayTitle
  return typeof title === "string" && title.trim() ? title.trim() : null
}

export function resolveOfficeCustomerHeroTitle(input: {
  inboundDisplayTitle?: string | null
  displayHeroTitle?: string | null
  transactionLabel?: string | null
}): string | null {
  const inbound = String(input.inboundDisplayTitle ?? "").trim()
  if (inbound) return inbound
  const hero = String(input.displayHeroTitle ?? "").trim()
  const label = String(input.transactionLabel ?? "").trim()
  if (isOrgTreasuryInboundTitle(label) && (!hero || hero.toLowerCase() === "stablecoin deposit")) {
    return label
  }
  if (hero) return hero
  return label || null
}

function toOfficeCustomerDetail(
  mapped: TransactionWithSource,
  meta: Record<string, unknown> | null,
): Record<string, unknown> {
  const receiveNetwork =
    String(meta?.receive_network ?? mapped.chain ?? "").trim() || null
  return {
    description: mapped.description,
    displayHeroTitle:
      resolveOfficeCustomerHeroTitle({
        inboundDisplayTitle: inboundReceiveDisplayTitle(mapped),
        displayHeroTitle: mapped.displayHeroTitle,
        transactionLabel: mapped.description,
      }) ?? null,
    paymentScheme: mapped.paymentScheme ?? null,
    counterpartyName: mapped.counterpartyName ?? null,
    sendNote: mapped.sendNote ?? null,
    narration: mapped.narration ?? null,
    payoutReview: mapped.payoutReview ?? null,
    payoutReviewFlow: mapped.payoutReviewFlow ?? null,
    depositReview: mapped.depositReview ?? null,
    inboundReceive: mapped.inboundReceive ?? null,
    recipientSnapshot: mapped.recipientSnapshot ?? null,
    moveReview: mapped.moveReview ?? null,
    lifecycle: mapped.lifecycle ?? null,
    transactionTiming: mapped.transactionTiming ?? null,
    quoteExpiresAt: mapped.quoteExpiresAt ?? null,
    ycPayInPaymentDetails: mapped.ycPayInPaymentDetails ?? null,
    stripePaymentMethod: mapped.stripePaymentMethod ?? null,
    settlementRailLabel: mapped.settlementRailLabel ?? null,
    customerName: mapped.customerName ?? null,
    customerEmail: mapped.customerEmail ?? null,
    fee: mapped.fee ?? null,
    postedAmount: mapped.postedAmount ?? null,
    depositAmount: mapped.depositAmount ?? null,
    postedCurrency: mapped.postedCurrency ?? null,
    chain: mapped.chain ?? null,
    walletAddress: mapped.walletAddress ?? null,
    counterpartyAddress: mapped.counterpartyAddress ?? null,
    receiveNetwork,
  }
}

export async function loadOfficeTransactionDetail(
  admin: AdminClient,
  rawId: string,
): Promise<{ detail: Record<string, unknown> | null; error: { message: string } | null; status: number }> {
  const lookedUp = await lookupOfficeLedgerDetailRow(admin, rawId)
  if (lookedUp.error) {
    return { detail: null, error: lookedUp.error, status: 400 }
  }
  if (!lookedUp.row) {
    return { detail: null, error: { message: "Not found" }, status: 404 }
  }

  let rec = lookedUp.row
  const priorMeta = asRecord(rec.metadata) ?? {}
  const { metadata: ycEnrichedMeta } = await enrichYcPayInMetadataFromTransfer(
    admin,
    priorMeta,
    rec.id != null ? String(rec.id) : null,
  )
  if (ycEnrichedMeta !== priorMeta) {
    rec = { ...rec, metadata: ycEnrichedMeta }
  }

  const [ycFundEnriched] = await enrichYcFundBalanceOfficeRows(admin, [rec as TxRow])
  if (ycFundEnriched) rec = ycFundEnriched as Record<string, unknown>

  const withProfiles = await attachProfiles(admin, rec)
  const transaction = enrichOfficeLedgerForUserDisplay(withProfiles)
  const meta = asRecord(transaction.metadata)
  const payload = asRecord(rec.payload)
  const mapped = mapRowToBusinessTransaction(rec)
  const relatedRows = await loadRelatedLedgerRows(admin, rec)

  const related = relatedRows.map((row) => {
    const enriched = enrichOfficeLedgerForUserDisplay(row as unknown as OfficeLedgerTransaction)
    return {
      id: String(row.id ?? ""),
      easner_transaction_id: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
      provider: String(row.provider ?? ""),
      provider_transaction_id:
        row.provider_transaction_id != null ? String(row.provider_transaction_id) : null,
      status: String(row.status ?? ""),
      direction: row.direction != null ? String(row.direction) : null,
      amountFormatted: enriched.amountFormatted,
      productLabel: enriched.productLabel,
      hiddenFromFeed: row.hidden_from_feed === true,
      created_at: String(row.created_at ?? ""),
    }
  })

  const userId = withProfiles.user_id ? String(withProfiles.user_id) : null
  const businessId = withProfiles.business_id ? String(withProfiles.business_id) : null
  const userName = String(withProfiles.user?.full_name ?? "").trim() || null
  const userEmail = String(withProfiles.user?.email ?? "").trim() || null
  const businessName = String(withProfiles.business?.name ?? "").trim() || null

  return {
    status: 200,
    error: null,
    detail: {
      transaction,
      customer: toOfficeCustomerDetail(mapped, meta),
      ops: {
        provider: transaction.provider ?? null,
        providerTransactionId: transaction.provider_transaction_id ?? null,
        providerEventId: transaction.provider_event_id ?? null,
        easnerTransactionId: transaction.easner_transaction_id ?? null,
        ledgerId: String(transaction.id),
        rawStatus: String(transaction.status ?? ""),
        ycMode: resolveOfficeYcMode(transaction),
        payInRail: resolveOfficePayInRail(transaction),
        chain: transaction.chain ?? null,
        asset: transaction.asset ?? null,
        txHash: transaction.tx_hash ?? null,
        walletAddress: transaction.wallet_address ?? null,
        counterpartyAddress: transaction.counterparty_address ?? null,
        failureReason: readUnsanitizedFailureReason(meta, payload),
        createdAt: transaction.created_at ?? null,
        occurredAt: transaction.occurred_at ?? null,
        updatedAt: transaction.updated_at ?? null,
        settledAt: transaction.settled_at ?? null,
        hiddenFromFeed: rec.hidden_from_feed === true,
      },
      account: {
        userId,
        userHref: userId ? `/users/${encodeURIComponent(userId)}` : null,
        userName,
        userEmail,
        businessId,
        businessHref: businessId ? `/businesses/${encodeURIComponent(businessId)}` : null,
        businessName,
      },
      related,
      metadata: meta,
      payload,
    },
  }
}
