import type { SupabaseClient } from "@supabase/supabase-js"
import { computeCustomerDepositFee } from "@easner/shared"
import { isDepositFeePricingEnabled } from "@/lib/deposit-omnibus/config"
import {
  relayFindRequestByDepositAddressV3,
  relayGetRequestV3,
  relayListRequestsV3,
} from "@/lib/relay/client"
import { isRelayTronInboundEnabled } from "@/lib/relay/config"
import type { RelayRequestV3 } from "@/lib/relay/types"
import {
  extractRelayOccurredAtV3,
  extractRelaySettledAtV3,
  extractRelayOutTxHashesV3,
  isRelayRequestTerminalV3,
  mapRelayRequestStatusV3,
  parseRelayFeesV3,
  parseRelayRouteAmountsV3,
  readRelayDepositAddressV3,
} from "@/lib/relay/requests-v3"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { findActiveRelayDepositAddress } from "./recipient"

export type RelayDepositRow = {
  id: string
  wallet_owner_id: string
  tron_address: string
  relay_request_id: string | null
  gross_usdt: number | null
  relay_fee: number | null
  on_chain_usdc: number | null
  easner_deposit_fee: number | null
  posted_amount: number | null
  status: string
  turnkey_tx_hash: string | null
  ledger_tx_id: string | null
  metadata?: Record<string, unknown> | null
}

const AMOUNT_MATCH_EPSILON = 0.02

function applyOwnerScope<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  scope: { userId: string; businessId: string | null },
): T {
  if (scope.businessId) return query.eq("business_id", scope.businessId)
  return query.eq("user_id", scope.userId).is("business_id", null)
}

function roundMoney(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000
}

/** Total customer-visible fee (bridge + Easner deposit fee) for transaction detail rows. */
export function resolveRelayDepositCustomerFee(row: {
  gross_usdt?: number | null
  posted_amount?: number | null
  relay_fee?: number | null
  easner_deposit_fee?: number | null
}): number {
  const gross = Number(row.gross_usdt ?? 0)
  const posted = Number(row.posted_amount ?? 0)
  if (Number.isFinite(gross) && gross > 0 && Number.isFinite(posted) && gross > posted) {
    return roundMoney(gross - posted)
  }
  const relayFee = Number(row.relay_fee ?? 0)
  const easnerFee = Number(row.easner_deposit_fee ?? 0)
  const combined = (Number.isFinite(relayFee) ? relayFee : 0) + (Number.isFinite(easnerFee) ? easnerFee : 0)
  return combined > 0 ? roundMoney(combined) : 0
}

function parseDepositAmounts(request: RelayRequestV3): {
  grossUsdt: number
  onChainUsdc: number
  relayFee: number
  easnerDepositFee: number
  postedAmount: number
  fillHashes: string[]
} {
  const fees = parseRelayFeesV3(request)
  const route = parseRelayRouteAmountsV3(request)
  const grossUsdt = route.deposited ?? 0
  const onChainUsdc = route.received ?? 0
  const relayFee = fees.actualUsd
  const easnerDepositFee =
    isDepositFeePricingEnabled() && grossUsdt > 0
      ? computeCustomerDepositFee(grossUsdt, "USD")
      : 0
  const postedAmount = roundMoney(Math.max(0, onChainUsdc - easnerDepositFee))
  const fillHashes = extractRelayOutTxHashesV3(request)
  return { grossUsdt, onChainUsdc, relayFee, easnerDepositFee, postedAmount, fillHashes }
}

function resolveRelayTronDepositSender(request: RelayRequestV3): string | null {
  const sender = String(request.sender ?? "").trim()
  if (sender) return sender
  const depositor = String(request.depositAddress?.depositor ?? "").trim()
  if (depositor) return depositor
  return null
}

function depositStatusFromRelay(mapped: "pending" | "settled" | "failed", hasLedgerCredit: boolean): string {
  if (hasLedgerCredit || mapped === "settled") return hasLedgerCredit ? "settled" : "awaiting_turnkey"
  if (mapped === "failed") return "failed"
  return "pending"
}

async function resolveOwnerScope(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<{ userId: string; businessId: string | null } | null> {
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref")
    .eq("id", walletOwnerId)
    .maybeSingle()
  if (!owner?.owner_ref || !owner?.owner_type) return null

  if (owner.owner_type === "business") {
    const businessId = String(owner.owner_ref)
    const { data: orgOwner } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    const userId = orgOwner?.id ? String(orgOwner.id) : null
    if (!userId) return null
    return { userId, businessId }
  }

  return { userId: String(owner.owner_ref), businessId: null }
}

export async function relayDepositLedgerCreditExists(
  admin: SupabaseClient,
  input: { txHash: string; userId: string; businessId: string | null },
): Promise<boolean> {
  const txHash = String(input.txHash || "").trim()
  if (!txHash) return false

  let q = admin
    .from("transactions")
    .select("id")
    .eq("provider", "relay")
    .eq("direction", "in")
    .eq("status", "settled")
    .eq("tx_hash", txHash)
  q = applyOwnerScope(q, input)
  const { data } = await q.maybeSingle()
  return Boolean(data?.id)
}

/** Upsert relay_deposits from a v3 request; does not credit wallet. */
export async function upsertRelayDepositFromRequestV3(
  admin: SupabaseClient,
  input: {
    request: RelayRequestV3
    walletOwnerId: string
    tronAddress: string
    webhookPayload?: Record<string, unknown>
  },
): Promise<{ row: RelayDepositRow | null; error?: string }> {
  const relayRequestId = String(input.request.id || "").trim()
  if (!relayRequestId) return { row: null, error: "missing_relay_request_id" }

  const mapped = mapRelayRequestStatusV3(String(input.request.status || ""))
  const amounts = parseDepositAmounts(input.request)
  const turnkeyTxHash = amounts.fillHashes[0] ?? null
  const senderTronAddress = resolveRelayTronDepositSender(input.request)

  const { data: existing } = await admin
    .from("relay_deposits")
    .select("id, ledger_tx_id, turnkey_tx_hash, status, metadata")
    .eq("relay_request_id", relayRequestId)
    .maybeSingle()

  const hasLedgerCredit = Boolean(existing?.ledger_tx_id)
  const status =
    mapped === "settled" && !hasLedgerCredit
      ? turnkeyTxHash
        ? "awaiting_turnkey"
        : "awaiting_turnkey"
      : hasLedgerCredit
        ? "settled"
        : depositStatusFromRelay(mapped, hasLedgerCredit)

  const priorMeta =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {}
  const occurredAt = extractRelayOccurredAtV3(input.request)
  const settledAt = extractRelaySettledAtV3(input.request)

  const { data, error } = await admin
    .from("relay_deposits")
    .upsert(
      {
        wallet_owner_id: input.walletOwnerId,
        tron_address: input.tronAddress,
        relay_request_id: relayRequestId,
        gross_usdt: amounts.grossUsdt,
        relay_fee: amounts.relayFee,
        on_chain_usdc: amounts.onChainUsdc,
        easner_deposit_fee: amounts.easnerDepositFee,
        posted_amount: amounts.postedAmount,
        status,
        turnkey_tx_hash: turnkeyTxHash ?? existing?.turnkey_tx_hash ?? null,
        metadata: {
          ...priorMeta,
          ...(input.webhookPayload ? { webhook: input.webhookPayload } : {}),
          ...(senderTronAddress ? { sender_tron_address: senderTronAddress } : {}),
          ...(occurredAt ? { relay_occurred_at: occurredAt } : {}),
          ...(settledAt ? { relay_settled_at: settledAt } : {}),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "relay_request_id" },
    )
    .select("*")
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  return { row: data as RelayDepositRow | null }
}

/** Idempotently credit wallet for a relay Tron deposit row. Requires fill tx hash. */
export async function tryCreditRelayTronDeposit(
  admin: SupabaseClient,
  depositId: string,
  opts?: { applyBalance?: boolean },
): Promise<{ credited: boolean; reason?: string }> {
  const { data: row } = await admin.from("relay_deposits").select("*").eq("id", depositId).maybeSingle()
  if (!row?.id) return { credited: false, reason: "deposit_not_found" }
  if (row.ledger_tx_id) return { credited: false, reason: "already_credited" }

  const postedAmount = Number(row.posted_amount ?? 0)
  if (!Number.isFinite(postedAmount) || postedAmount <= 0) {
    return { credited: false, reason: "invalid_posted_amount" }
  }

  const txHash = String(row.turnkey_tx_hash || "").trim()
  if (!txHash) return { credited: false, reason: "missing_turnkey_tx_hash" }

  const scope = await resolveOwnerScope(admin, String(row.wallet_owner_id))
  if (!scope) return { credited: false, reason: "owner_not_found" }

  if (
    await relayDepositLedgerCreditExists(admin, {
      txHash,
      userId: scope.userId,
      businessId: scope.businessId,
    })
  ) {
    await admin
      .from("relay_deposits")
      .update({ status: "settled", updated_at: new Date().toISOString() })
      .eq("id", row.id)
    return { credited: false, reason: "ledger_already_exists" }
  }

  const depositMeta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {}
  const occurredAt = String(depositMeta.relay_occurred_at || "").trim() || new Date().toISOString()
  const settledAt = String(depositMeta.relay_settled_at || "").trim() || occurredAt
  const customerFee = resolveRelayDepositCustomerFee(row)
  const senderTronAddress =
    typeof depositMeta.sender_tron_address === "string"
      ? depositMeta.sender_tron_address.trim()
      : ""
  const applyBalance = opts?.applyBalance !== false
  const upsert = await upsertLedgerTransaction(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    provider: "relay",
    providerTransactionId: String(row.relay_request_id || row.id),
    status: "settled",
    amount: postedAmount,
    currency: "USD",
    direction: "in",
    occurredAt,
    settledAt,
    createdAt: occurredAt,
    txHash,
    asset: "USDC",
    chain: "Solana",
    counterpartyAddress: senderTronAddress || null,
    metadata: {
      activity_type: "relay_tron_deposit",
      source_type: "relay_tron_deposit",
      source_payment_rail: "tron",
      source_currency: "USDT",
      tron_address: row.tron_address,
      gross_usdt: row.gross_usdt,
      relay_fee: row.relay_fee,
      on_chain_usdc: row.on_chain_usdc,
      easner_deposit_fee: row.easner_deposit_fee,
      fee_amount: customerFee > 0 ? customerFee : undefined,
      posted_amount: postedAmount,
      posted_currency: "USD",
      ...(senderTronAddress ? { sender_tron_address: senderTronAddress, from_address: senderTronAddress } : {}),
      relay_request_id: row.relay_request_id,
      balance_delta_applied: applyBalance,
    },
  })

  await admin
    .from("transactions")
    .update({
      created_at: occurredAt,
      occurred_at: occurredAt,
      settled_at: settledAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", upsert.transactionId)

  const shouldApplyBalance = applyBalance && (upsert.inserted || upsert.becameSettled)
  if (shouldApplyBalance) {
    await applyWalletBalanceDelta(admin, {
      userId: scope.userId,
      businessId: scope.businessId,
      currency: "USD",
      delta: postedAmount,
    })
  }

  await admin
    .from("relay_deposits")
    .update({
      status: "settled",
      ledger_tx_id: upsert.transactionId,
      updated_at: occurredAt,
    })
    .eq("id", row.id)

  return { credited: true }
}

/** Link fill hash and credit after Turnkey observes Relay settlement on the vault ATA. */
export async function reconcileRelayDepositCreditForSolanaTx(
  admin: SupabaseClient,
  input: {
    solanaTxHash: string
    userId: string
    businessId: string | null
    inboundAmount?: number
    recipientVaultAta?: string | null
  },
): Promise<{ credited: boolean }> {
  if (!isRelayTronInboundEnabled()) return { credited: false }

  const solanaTxHash = String(input.solanaTxHash || "").trim()
  if (!solanaTxHash) return { credited: false }

  let deposit: RelayDepositRow | null = null

  const { data: byHash } = await admin
    .from("relay_deposits")
    .select("*")
    .eq("turnkey_tx_hash", solanaTxHash)
    .maybeSingle()
  deposit = (byHash as RelayDepositRow | null) ?? null

  if (!deposit?.id && input.recipientVaultAta) {
    const addrRow = await findActiveRelayDepositAddress(admin, {
      solanaAddress: input.recipientVaultAta,
    })

    if (addrRow?.tron_address) {
      const scope = await resolveOwnerScope(admin, String(addrRow.wallet_owner_id))
      if (
        scope &&
        ((input.businessId && scope.businessId === input.businessId) ||
          (!input.businessId && scope.userId === input.userId))
      ) {
        let request =
          (await relayListRequestsV3({ term: solanaTxHash, limit: 5 })).requests?.[0] ?? null
        if (!request) {
          request = await relayFindRequestByDepositAddressV3(String(addrRow.tron_address))
        }
        if (request && isRelayRequestTerminalV3(String(request.status))) {
          const upserted = await upsertRelayDepositFromRequestV3(admin, {
            request,
            walletOwnerId: String(addrRow.wallet_owner_id),
            tronAddress: String(addrRow.tron_address),
          })
          deposit = upserted.row
        }
      }
    }
  }

  if (!deposit?.id) {
    const { data: pendingRows } = await admin
      .from("relay_deposits")
      .select("*")
      .in("status", ["pending", "awaiting_turnkey"])
      .is("ledger_tx_id", null)
      .order("updated_at", { ascending: false })
      .limit(20)

    const inboundAmount = Number(input.inboundAmount ?? NaN)
    for (const row of pendingRows ?? []) {
      const scope = await resolveOwnerScope(admin, String(row.wallet_owner_id))
      if (!scope) continue
      if (input.businessId) {
        if (scope.businessId !== input.businessId) continue
      } else if (scope.userId !== input.userId) {
        continue
      }
      if (Number.isFinite(inboundAmount)) {
        const expected = Number(row.on_chain_usdc ?? row.posted_amount ?? NaN)
        if (Number.isFinite(expected) && Math.abs(expected - inboundAmount) > AMOUNT_MATCH_EPSILON) {
          continue
        }
      }
      deposit = row as RelayDepositRow
      break
    }
  }

  if (!deposit?.id) return { credited: false }

  if (!deposit.turnkey_tx_hash) {
    await admin
      .from("relay_deposits")
      .update({
        turnkey_tx_hash: solanaTxHash,
        status: "awaiting_turnkey",
        updated_at: new Date().toISOString(),
      })
      .eq("id", deposit.id)
  }

  const result = await tryCreditRelayTronDeposit(admin, String(deposit.id))
  if (deposit.tron_address) {
    await reconcileRelayDepositsForTronAddress(admin, String(deposit.tron_address)).catch(() => {})
  }
  return { credited: result.credited }
}

export async function syncRelayDepositFromRequestId(
  admin: SupabaseClient,
  input: {
    relayRequestId?: string
    tronAddress?: string
    depositAddress?: string
    webhookPayload?: Record<string, unknown>
    skipAddressSweep?: boolean
    applyBalance?: boolean
  },
): Promise<{ ok: true; action: string } | { ok: false; error: string }> {
  if (!isRelayTronInboundEnabled()) {
    return { ok: false, error: "relay_tron_inbound_disabled" }
  }

  const requestId = String(input.relayRequestId || "").trim()
  const depositAddress = String(input.depositAddress || input.tronAddress || "").trim()

  let request = requestId ? await relayGetRequestV3(requestId) : null
  if (!request && depositAddress) {
    request = await relayFindRequestByDepositAddressV3(depositAddress)
  }
  if (!request) return { ok: false, error: "relay_request_not_found" }

  const status = String(request.status || "")
  if (!isRelayRequestTerminalV3(status) && status !== "depositing" && status !== "submitted") {
    return { ok: true, action: "ignored_non_terminal" }
  }

  const tronAddress =
    readRelayDepositAddressV3(request) ??
    depositAddress ??
    String((request.metadata as Record<string, unknown> | undefined)?.depositAddress ?? "").trim()
  if (!tronAddress) return { ok: false, error: "missing_deposit_address" }

  const { data: addrRow } = await admin
    .from("relay_deposit_addresses")
    .select("wallet_owner_id")
    .eq("tron_address", tronAddress)
    .maybeSingle()
  if (!addrRow?.wallet_owner_id) return { ok: false, error: "unknown_deposit_address" }

  const upserted = await upsertRelayDepositFromRequestV3(admin, {
    request,
    walletOwnerId: String(addrRow.wallet_owner_id),
    tronAddress,
    webhookPayload: input.webhookPayload,
  })
  if (upserted.error || !upserted.row) {
    return { ok: false, error: upserted.error ?? "upsert_failed" }
  }

  const mapped = mapRelayRequestStatusV3(status)
  let action = "deposit_recorded_pending"
  if (mapped === "settled") {
    const credit = await tryCreditRelayTronDeposit(admin, upserted.row.id, {
      applyBalance: input.applyBalance,
    })
    if (credit.credited) action = "credited"
    else if (credit.reason === "already_credited") action = "already_credited"
    else if (credit.reason === "missing_turnkey_tx_hash") action = "awaiting_turnkey"
    else action = credit.reason ?? "awaiting_turnkey"
  }

  if (!input.skipAddressSweep && tronAddress) {
    await reconcileRelayDepositsForTronAddress(admin, tronAddress).catch(() => {})
  }

  return { ok: true, action }
}

/** Persist every recent Relay request for an address so a later fill cannot hide an earlier one. */
export async function reconcileRelayDepositsForTronAddress(
  admin: SupabaseClient,
  tronAddress: string,
): Promise<{ scanned: number; credited: number }> {
  const addr = String(tronAddress || "").trim()
  if (!addr || !isRelayTronInboundEnabled()) return { scanned: 0, credited: 0 }

  const page = await relayListRequestsV3({ depositAddress: addr, limit: 20 })
  let scanned = 0
  let credited = 0
  for (const request of page.requests ?? []) {
    const id = String(request.id || "").trim()
    if (!id) continue
    scanned += 1
    const sync = await syncRelayDepositFromRequestId(admin, {
      relayRequestId: id,
      tronAddress: addr,
      skipAddressSweep: true,
    })
    if (sync.ok && sync.action === "credited") credited += 1
  }
  return { scanned, credited }
}

const DEFAULT_RECONCILE_LOOKBACK_DAYS = 14

export async function reconcileRelayDepositsForOwner(
  admin: SupabaseClient,
  opts: { userId: string; businessId: string | null; sinceDays?: number },
): Promise<{ attempted: number; credited: number }> {
  if (!isRelayTronInboundEnabled()) return { attempted: 0, credited: 0 }

  const sinceIso = new Date(
    Date.now() - (opts.sinceDays ?? DEFAULT_RECONCILE_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data: owners } = await admin
    .from("wallet_owners")
    .select("id")
    .eq("owner_type", opts.businessId ? "business" : "individual")
    .eq("owner_ref", opts.businessId ?? opts.userId)

  const ownerIds = (owners ?? []).map((o) => String(o.id))
  if (!ownerIds.length) return { attempted: 0, credited: 0 }

  const { data: rows } = await admin
    .from("relay_deposits")
    .select("id, tron_address, relay_request_id, turnkey_tx_hash")
    .in("wallet_owner_id", ownerIds)
    .in("status", ["pending", "awaiting_turnkey"])
    .is("ledger_tx_id", null)
    .gte("updated_at", sinceIso)
    .limit(50)

  let attempted = 0
  let credited = 0

  for (const row of rows ?? []) {
    attempted += 1
    if (row.relay_request_id) {
      await syncRelayDepositFromRequestId(admin, {
        relayRequestId: String(row.relay_request_id),
        tronAddress: String(row.tron_address),
      }).catch(() => undefined)
    } else if (row.tron_address) {
      await syncRelayDepositFromRequestId(admin, {
        tronAddress: String(row.tron_address),
      }).catch(() => undefined)
    }

    if (row.turnkey_tx_hash) {
      const tryCredit = await tryCreditRelayTronDeposit(admin, String(row.id))
      if (tryCredit.credited) credited += 1
      continue
    }

    const tryCredit = await tryCreditRelayTronDeposit(admin, String(row.id))
    if (tryCredit.credited) credited += 1
  }

  return { attempted, credited }
}

export async function reconcilePendingRelayDeposits(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<{ scanned: number; synced: number; credited: number }> {
  if (!isRelayTronInboundEnabled()) return { scanned: 0, synced: 0, credited: 0 }

  const { data: rows } = await admin
    .from("relay_deposits")
    .select("id, tron_address, relay_request_id, turnkey_tx_hash")
    .in("status", ["pending", "awaiting_turnkey"])
    .is("ledger_tx_id", null)
    .order("updated_at", { ascending: true })
    .limit(opts?.limit ?? 100)

  let synced = 0
  let credited = 0

  for (const row of rows ?? []) {
    const sync = await syncRelayDepositFromRequestId(admin, {
      relayRequestId: row.relay_request_id ? String(row.relay_request_id) : undefined,
      tronAddress: String(row.tron_address),
    })
    if (sync.ok && sync.action !== "ignored_non_terminal") synced += 1
    if (sync.ok && sync.action === "credited") credited += 1

    const tryCredit = await tryCreditRelayTronDeposit(admin, String(row.id))
    if (tryCredit.credited) credited += 1

    if (row.turnkey_tx_hash) {
      const scopeOwner = await admin
        .from("relay_deposits")
        .select("wallet_owner_id")
        .eq("id", row.id)
        .maybeSingle()
      const scope = scopeOwner.data?.wallet_owner_id
        ? await resolveOwnerScope(admin, String(scopeOwner.data.wallet_owner_id))
        : null
      if (scope?.userId || scope?.businessId) {
        const rec = await reconcileRelayDepositCreditForSolanaTx(admin, {
          solanaTxHash: String(row.turnkey_tx_hash),
          userId: scope.userId ?? "",
          businessId: scope.businessId,
        })
        if (rec.credited) credited += 1
      }
    }
  }

  return { scanned: rows?.length ?? 0, synced, credited }
}
