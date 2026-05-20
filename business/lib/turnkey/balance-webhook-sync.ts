import type { SupabaseClient } from "@supabase/supabase-js"
import { applyTurnkeyInboundLedgerEvent } from "@/lib/turnkey/apply-turnkey-inbound-ledger"
import { isTurnkeyBalanceWebhooksIngestEnabled } from "@/lib/turnkey/config"
import { resolveTurnkeyWalletScopeFromEvent } from "@/lib/turnkey/resolve-turnkey-wallet-scope"

type TurnkeyEvent = Record<string, unknown>

function walkObject(value: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const item of value) walkObject(item, visit)
    return
  }
  const obj = value as Record<string, unknown>
  visit(obj)
  for (const v of Object.values(obj)) walkObject(v, visit)
}

function pickNestedString(payload: TurnkeyEvent, keys: string[]): string | null {
  let found: string | null = null
  walkObject(payload, (obj) => {
    if (found) return
    for (const key of keys) {
      const v = obj[key]
      if (v != null && String(v).trim()) {
        found = String(v).trim()
        return
      }
    }
  })
  return found
}

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

function toIsoOrNow(raw: string | number | Record<string, unknown> | null): string {
  if (raw == null) return new Date().toISOString()
  if (typeof raw === "object") {
    const seconds = Number((raw as { seconds?: unknown }).seconds ?? NaN)
    const nanos = Number((raw as { nanos?: unknown }).nanos ?? 0)
    if (Number.isFinite(seconds)) {
      const ms = seconds * 1000 + (Number.isFinite(nanos) ? Math.floor(nanos / 1_000_000) : 0)
      const t = new Date(ms)
      if (!Number.isNaN(t.getTime())) return t.toISOString()
    }
  }
  const t = new Date(String(raw))
  if (Number.isNaN(t.getTime())) return new Date().toISOString()
  return t.toISOString()
}

function mapAssetToCurrency(asset: string | null): string {
  const a = String(asset || "").trim().toUpperCase()
  if (a === "EURC") return "EUR"
  return "USD"
}

function parseAmountMajor(event: TurnkeyEvent): { amount: number; amountMinor: string | null } {
  const minorRaw =
    pickFirstString(event, ["amountMinor", "amount_minor", "tokenAmountMinor", "rawAmount", "amount_raw"]) ||
    pickNestedString(event, ["amountMinor", "amount_minor", "tokenAmountMinor", "rawAmount", "amount_raw"])
  if (minorRaw) {
    const minor = Number(minorRaw)
    if (Number.isFinite(minor)) {
      return { amount: minor / 1_000_000, amountMinor: minorRaw }
    }
  }
  const majorRaw =
    pickFirstString(event, ["amount", "tokenAmount", "value"]) ||
    pickNestedString(event, ["amount", "tokenAmount", "value"])
  if (majorRaw) {
    const major = Number(majorRaw)
    if (Number.isFinite(major)) {
      return { amount: major, amountMinor: null }
    }
  }
  return { amount: 0, amountMinor: null }
}

/**
 * Ingest Turnkey BALANCE_CONFIRMED_UPDATES as organic Stablecoin Deposit rows.
 */
export async function applyTurnkeyBalanceWebhookSideEffects(
  admin: SupabaseClient,
  payload: unknown,
  eventId: string,
): Promise<boolean> {
  if (!isTurnkeyBalanceWebhooksIngestEnabled()) return false

  const event = (payload || {}) as TurnkeyEvent
  const scope = await resolveTurnkeyWalletScopeFromEvent(admin, event)
  if (!scope) return false

  const txHash =
    pickFirstString(event, ["txHash", "transactionHash", "signature", "hash"]) ||
    pickNestedString(event, ["txHash", "transactionHash", "signature", "hash"])
  if (!txHash) return false

  const { amount, amountMinor } = parseAmountMajor(event)
  if (!Number.isFinite(amount) || amount <= 0) return false

  const asset = String(
    scope.walletAccount.asset ||
      pickFirstString(event, ["asset", "token", "symbol"]) ||
      pickNestedString(event, ["asset", "token", "symbol"]) ||
      "USDC",
  ).toUpperCase()
  const chain = String(
    scope.walletAccount.chain ||
      pickFirstString(event, ["chain", "network"]) ||
      pickNestedString(event, ["chain", "network"]) ||
      "solana",
  ).toLowerCase()
  const currency = mapAssetToCurrency(asset)

  const occurredRaw =
    pickFirstString(event, ["occurredAt", "createdAt", "timestamp", "created"]) ||
    pickNestedString(event, ["occurredAt", "createdAt", "timestamp", "created"])
  const occurredAt = toIsoOrNow(occurredRaw)
  const settledAtRaw =
    pickFirstString(event, ["settledAt", "confirmedAt", "includedAt", "completedAt"]) ||
    pickNestedString(event, ["settledAt", "confirmedAt", "includedAt", "completedAt"])
  const settledAt = toIsoOrNow(settledAtRaw ?? occurredAt)

  const addressForId = scope.tokenAccountAddress || scope.walletAddress
  const providerTransactionId =
    pickFirstString(event, ["id", "eventId", "activityId"]) ||
    pickNestedString(event, ["id", "eventId", "activityId"]) ||
    `${txHash}:${addressForId}:${asset}`

  const counterpartyAddress =
    pickFirstString(event, ["fromAddress", "sourceAddress", "senderAddress"]) ||
    pickNestedString(event, ["fromAddress", "sourceAddress", "senderAddress"])

  const result = await applyTurnkeyInboundLedgerEvent(admin, {
    userId: scope.userId,
    businessId: scope.businessId,
    walletAccount: {
      id: String(scope.walletAccount.id),
      address: scope.walletAddress,
      asset,
      chain,
      associated_token_account_address: scope.tokenAccountAddress || null,
    },
    providerTransactionId,
    providerEventId: eventId,
    status: "settled",
    amount,
    currency,
    direction: "in",
    payload: event,
    metadata: { source: "turnkey_balance_webhook" },
    txHash,
    walletAddress: scope.walletAddress,
    counterpartyAddress,
    occurredAt,
    settledAt,
    asset,
    chain,
    amountMinor,
  })

  return result.kind === "applied" || result.kind === "suppressed_noah" || result.kind === "suppressed_easetag"
}
