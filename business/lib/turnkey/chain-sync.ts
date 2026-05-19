import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { findEasetagSettlementForChainSuppression, updateEasetagSettlementSettled } from "@/lib/ledger/easetag-settlement"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { enqueueLiquiditySweepJob } from "@/lib/liquidity/sweep-jobs"
import { resolvePooledSolanaSourceAddress, ledgerCurrencyForStablecoinAsset } from "@/lib/liquidity/platform-pool"

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
  opts?: { skipBalanceDelta?: boolean },
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
    .map((a) => String(a).trim())
    .filter(Boolean)
  if (addressCandidates.length === 0) return false

  const select =
    "id, wallet_owner_id, address, asset, chain, associated_token_account_address" as const
  type WalletAccountMatchRow = {
    id: string
    wallet_owner_id: string
    address: string
    asset: string
    chain: string
    associated_token_account_address: string | null
  }
  const [{ data: byOwner }, { data: byAta }] = await Promise.all([
    admin.from("wallet_accounts").select(select).eq("status", "active").in("address", addressCandidates).limit(10),
    admin
      .from("wallet_accounts")
      .select(select)
      .eq("status", "active")
      .in("associated_token_account_address", addressCandidates)
      .limit(10),
  ])

  const merged = new Map<string, WalletAccountMatchRow>()
  for (const row of [...(byOwner ?? []), ...(byAta ?? [])]) {
    const r = row as WalletAccountMatchRow
    const key = `${String(r.wallet_owner_id)}:${String(r.id)}:${String(r.address)}:${String(r.asset)}`
    merged.set(key, r)
  }
  const walletAccounts = [...merged.values()]
  if (!walletAccounts.length) return false

  const walletAccount =
    walletAccounts.find((row) => {
      const o = String(row.address || "").trim()
      const a = String(row.associated_token_account_address || "").trim()
      return toCandidates.has(o) || (a && toCandidates.has(a))
    }) ||
    walletAccounts.find((row) => {
      const o = String(row.address || "").trim()
      const a = String(row.associated_token_account_address || "").trim()
      return fromCandidates.has(o) || (a && fromCandidates.has(a))
    }) ||
    walletAccounts[0]
  if (!walletAccount?.wallet_owner_id) return false
  const walletAddress = String(walletAccount.address || "").trim()
  if (!walletAddress) return false
  const tokenAccountAddress = String(walletAccount.associated_token_account_address || "").trim()

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
    if (
      toCandidates.has(walletAddress) ||
      (tokenAccountAddress && toCandidates.has(tokenAccountAddress)) ||
      (maybeToAddress && maybeToAddress === walletAddress) ||
      (maybeToAddress && tokenAccountAddress && maybeToAddress === tokenAccountAddress)
    )
      direction = "in"
    else if (
      fromCandidates.has(walletAddress) ||
      (tokenAccountAddress && fromCandidates.has(tokenAccountAddress)) ||
      (maybeFromAddress && maybeFromAddress === walletAddress) ||
      (maybeFromAddress && tokenAccountAddress && maybeFromAddress === tokenAccountAddress)
    )
      direction = "out"
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

  const upsert = await upsertLedgerTransaction(admin, {
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

  const easetagSuppressed = await findEasetagSettlementForChainSuppression(admin, {
    turnkeySendStatusId: providerTransactionId,
    txHash,
  })
  if (easetagSuppressed && status === "settled") {
    await updateEasetagSettlementSettled(admin, easetagSuppressed.transfer_group_id, txHash).catch(() => {})
  }

  // Update DB-backed balance snapshot for realtime dashboards.
  // For settled events we apply the delta; pending/failed should not move balances.
  if (
    !opts?.skipBalanceDelta &&
    !easetagSuppressed &&
    status === "settled" &&
    (upsert.inserted || upsert.becameSettled)
  ) {
    const businessScopeId = businessId ? businessId : null
    const userScopeId = businessId ? null : userId
    const signed = direction === "in" ? amount : -amount
    await applyWalletBalanceDelta(admin, {
      businessId: businessScopeId,
      userId: userScopeId,
      currency,
      delta: signed,
    })

    if (direction === "in" && amount > 0 && walletAccount.id) {
      const lc = ledgerCurrencyForStablecoinAsset(asset)
      const poolAddr = lc ? await resolvePooledSolanaSourceAddress(admin, { ledgerCurrency: lc }) : null
      const userAddr = String(walletAddress || "").trim()
      if (poolAddr && userAddr && poolAddr.trim() !== userAddr.trim()) {
        const idem = `sweep:${providerTransactionId}:${String(walletAccount.id)}`
        await enqueueLiquiditySweepJob(admin, {
          walletAccountId: String(walletAccount.id),
          asset,
          amount,
          idempotencyKey: idem,
        }).catch((e) => console.warn("enqueueLiquiditySweepJob (non-fatal):", e))
      }
    }
  }
  return true
}
