import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"

type TurnkeyEvent = Record<string, unknown>

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

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
    const direct = pickFirstString(obj, keys)
    if (direct) found = direct
  })
  return found
}

function collectNestedStrings(payload: TurnkeyEvent, keys: string[]): string[] {
  const out = new Set<string>()
  walkObject(payload, (obj) => {
    for (const key of keys) {
      const v = obj[key]
      if (v == null) continue
      const text = String(v).trim()
      if (text) out.add(text)
    }
  })
  return [...out]
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
    pickFirstString(event, ["amountMinor", "amount_minor", "tokenAmountMinor", "rawAmount", "amount_raw"]) || null
  if (minorRaw) {
    const minor = Number(minorRaw)
    if (Number.isFinite(minor)) {
      return { amount: minor / 1_000_000, amountMinor: minorRaw }
    }
  }
  const majorRaw = pickFirstString(event, ["amount", "tokenAmount", "value"])
  if (majorRaw) {
    const major = Number(majorRaw)
    if (Number.isFinite(major)) {
      return { amount: major, amountMinor: null }
    }
  }
  return { amount: 0, amountMinor: null }
}

function deriveDirection(event: TurnkeyEvent): "in" | "out" | null {
  const explicit = String(
    event.direction ?? event.transferDirection ?? event.flowDirection ?? event.movementDirection ?? "",
  ).toLowerCase()
  if (explicit.includes("in")) return "in"
  if (explicit.includes("out")) return "out"

  const type = String(event.type ?? event.eventType ?? event.activityType ?? "").toLowerCase()
  if (type.includes("deposit") || type.includes("receive") || type.includes("inbound")) return "in"
  if (type.includes("send") || type.includes("withdraw") || type.includes("outbound")) return "out"
  return null
}

export async function applyTurnkeyWebhookSideEffects(
  admin: SupabaseClient,
  payload: unknown,
  eventId: string,
): Promise<boolean> {
  const event = (payload || {}) as TurnkeyEvent
  const toCandidates = new Set<string>([
    ...collectNestedStrings(event, ["toAddress", "destinationAddress", "recipientAddress", "accountAddress"]),
    ...(() => {
      const direct = pickFirstString(event, ["toAddress", "destinationAddress", "recipientAddress", "accountAddress"])
      return direct ? [direct] : []
    })(),
  ])
  const fromCandidates = new Set<string>([
    ...collectNestedStrings(event, ["fromAddress", "sourceAddress", "senderAddress"]),
    ...(() => {
      const direct = pickFirstString(event, ["fromAddress", "sourceAddress", "senderAddress"])
      return direct ? [direct] : []
    })(),
  ])
  const genericCandidates = new Set<string>([
    ...collectNestedStrings(event, ["walletAddress", "address"]),
    ...(() => {
      const direct = pickFirstString(event, ["walletAddress", "address"])
      return direct ? [direct] : []
    })(),
  ])
  const addressCandidates = [...new Set<string>([...toCandidates, ...fromCandidates, ...genericCandidates])]
  if (addressCandidates.length === 0) return false

  const { data: walletAccounts } = await admin
    .from("wallet_accounts")
    .select("wallet_owner_id, address, asset, chain")
    .eq("status", "active")
    .in("address", addressCandidates)
    .limit(5)
  if (!walletAccounts?.length) return false

  const walletAccount =
    walletAccounts.find((row) => toCandidates.has(String(row.address || ""))) ||
    walletAccounts.find((row) => fromCandidates.has(String(row.address || ""))) ||
    walletAccounts[0]
  if (!walletAccount?.wallet_owner_id) return false
  const walletAddress = String(walletAccount.address || "").trim()
  if (!walletAddress) return false

  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref")
    .eq("id", walletAccount.wallet_owner_id)
    .maybeSingle()
  if (!owner?.owner_ref || !owner?.owner_type) return false

  let userId: string | null = null
  let businessId: string | null = null
  if (owner.owner_type === "business") {
    businessId = String(owner.owner_ref)
    const { data: orgOwner } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    userId = orgOwner?.id ? String(orgOwner.id) : null
  } else {
    userId = String(owner.owner_ref)
  }
  if (!userId) return false

  let direction = deriveDirection(event)
  const maybeToAddress =
    pickFirstString(event, ["toAddress", "destinationAddress", "recipientAddress"]) ||
    pickNestedString(event, ["toAddress", "destinationAddress", "recipientAddress"])
  const maybeFromAddress =
    pickFirstString(event, ["fromAddress", "sourceAddress", "senderAddress"]) ||
    pickNestedString(event, ["fromAddress", "sourceAddress", "senderAddress"])
  if (!direction) {
    if (toCandidates.has(walletAddress) || (maybeToAddress && maybeToAddress === walletAddress)) direction = "in"
    else if (fromCandidates.has(walletAddress) || (maybeFromAddress && maybeFromAddress === walletAddress)) direction = "out"
  }
  if (!direction) return false

  const providerTransactionId =
    pickFirstString(event, ["activityId", "transactionId", "id", "hash", "signature"]) ||
    pickNestedString(event, ["activityId", "transactionId", "id", "hash", "signature"]) ||
    eventId
  const providerEventId = eventId
  const txHash =
    pickFirstString(event, ["txHash", "transactionHash", "signature", "hash"]) ||
    pickNestedString(event, ["txHash", "transactionHash", "signature", "hash"])
  const counterpartyAddress =
    direction === "in"
      ? (pickFirstString(event, ["fromAddress", "sourceAddress", "senderAddress"]) ||
          pickNestedString(event, ["fromAddress", "sourceAddress", "senderAddress"]))
      : (pickFirstString(event, ["toAddress", "destinationAddress", "recipientAddress"]) ||
          pickNestedString(event, ["toAddress", "destinationAddress", "recipientAddress"]))
  const occurredRaw =
    pickFirstString(event, ["occurredAt", "createdAt", "timestamp", "created"]) ||
    pickNestedString(event, ["occurredAt", "createdAt", "timestamp", "created"]) ||
    ((event.createdAt as Record<string, unknown> | undefined) ?? null) ||
    ((event.timestamp as Record<string, unknown> | undefined) ?? null)
  const occurredAt = toIsoOrNow(occurredRaw)
  const settledAtRaw =
    pickFirstString(event, ["settledAt", "confirmedAt", "includedAt", "completedAt"]) ||
    pickNestedString(event, ["settledAt", "confirmedAt", "includedAt", "completedAt"])
  const statusRaw = String(event.status ?? "").toLowerCase()
  const status =
    statusRaw.includes("fail") ? "failed" : statusRaw.includes("pending") ? "pending" : "settled"
  const settledAt = status === "settled" ? toIsoOrNow(settledAtRaw ?? occurredAt) : null
  const asset = String(
    walletAccount.asset ||
      pickFirstString(event, ["asset", "token", "symbol"]) ||
      pickNestedString(event, ["asset", "token", "symbol"]) ||
      "USDC",
  ).toUpperCase()
  const chain = String(
    walletAccount.chain ||
      pickFirstString(event, ["chain", "network"]) ||
      pickNestedString(event, ["chain", "network"]) ||
      "solana",
  ).toLowerCase()
  const { amount, amountMinor } = parseAmountMajor(event)
  const currency = mapAssetToCurrency(asset)

  await upsertLedgerTransaction(admin, {
    userId,
    businessId,
    provider: "turnkey",
    providerTransactionId,
    providerEventId,
    status,
    amount,
    currency,
    direction,
    payload: event,
    metadata: { source: "turnkey_webhook" },
    txHash,
    walletAddress,
    counterpartyAddress,
    occurredAt,
    settledAt,
    asset,
    chain,
    amountMinor,
    baseCurrency: currency,
  })
  return true
}
