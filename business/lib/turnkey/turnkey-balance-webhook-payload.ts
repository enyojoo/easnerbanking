/**
 * Turnkey balance webhooks (`BALANCE_CONFIRMED_UPDATES` / `BALANCE_FINALIZED_UPDATES`)
 * use `balances:confirmed` and `balances:finalized` envelopes with the same on-chain tx.
 * @see https://docs.turnkey.com/concepts/balances#delivery-payload
 */

export type NormalizedTurnkeyBalanceDeposit = {
  eventId: string
  eventType: string
  txHash: string
  /** Wallet owner or SPL token account address from Turnkey. */
  address: string
  asset: "USDC" | "EURC"
  amount: number
  amountMinor: string | null
  decimals: number
  occurredAt: string
  settledAt: string
  counterpartyAddress: string | null
  caip2: string | null
  raw: Record<string, unknown>
}

export type ParsedTurnkeyBalanceWebhook =
  | { kind: "deposit"; data: NormalizedTurnkeyBalanceDeposit }
  | { kind: "withdraw"; eventId: string; eventType: string }
  | { kind: "unrecognized" }

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function mapSymbolToAsset(symbol: string): "USDC" | "EURC" | null {
  const s = symbol.trim().toUpperCase()
  if (s === "USDC" || s.includes("USDC")) return "USDC"
  if (s === "EURC" || s.includes("EURC")) return "EURC"
  return null
}

function parseAmountFromAsset(asset: Record<string, unknown>): {
  amount: number
  amountMinor: string | null
  decimals: number
} | null {
  const decimals = Number(asset.decimals ?? 6)
  const raw = asset.amount
  if (raw == null) return null

  const rawStr = String(raw).trim()
  if (/^-?\d+$/.test(rawStr)) {
    try {
      const minor = BigInt(rawStr)
      const divisor = 10 ** Math.max(0, Math.min(12, decimals))
      return { amount: Number(minor) / divisor, amountMinor: rawStr, decimals }
    } catch {
      return null
    }
  }

  const major = Number(rawStr)
  if (!Number.isFinite(major) || major <= 0) return null
  return { amount: major, amountMinor: null, decimals }
}

/** Official Turnkey balance webhook (`type: balances:confirmed`). */
function parseBalancesConfirmedEnvelope(
  root: Record<string, unknown>,
): ParsedTurnkeyBalanceWebhook {
  const msg = asRecord(root.msg)
  if (!msg) return { kind: "unrecognized" }

  const operation = String(msg.operation ?? "").trim().toLowerCase()
  const txHash = String(msg.txHash ?? "").trim()
  const address = String(msg.address ?? "").trim()
  const eventId =
    String(msg.idempotencyKey ?? "").trim() || (txHash && address ? `${txHash}:${address}` : "")

  const eventType = String(root.type ?? "balances:confirmed").trim()

  if (!eventId || !txHash || !address) return { kind: "unrecognized" }

  if (operation === "withdraw") {
    return { kind: "withdraw", eventId, eventType }
  }
  if (operation !== "deposit") return { kind: "unrecognized" }

  const assetObj = asRecord(msg.asset)
  if (!assetObj) return { kind: "unrecognized" }

  const asset = mapSymbolToAsset(String(assetObj.symbol ?? ""))
  if (!asset) return { kind: "unrecognized" }

  const parsedAmount = parseAmountFromAsset(assetObj)
  if (!parsedAmount || parsedAmount.amount <= 0) return { kind: "unrecognized" }

  const block = asRecord(msg.block)
  const occurredAt = block?.timestamp ? String(block.timestamp) : new Date().toISOString()

  return {
    kind: "deposit",
    data: {
      eventId,
      eventType,
      txHash,
      address,
      asset,
      amount: parsedAmount.amount,
      amountMinor: parsedAmount.amountMinor,
      decimals: parsedAmount.decimals,
      occurredAt,
      settledAt: occurredAt,
      counterpartyAddress: null,
      caip2: msg.caip2 != null ? String(msg.caip2) : null,
      raw: root,
    },
  }
}

/** Legacy / beta shapes (top-level hash + amount fields). */
function parseLegacyBalanceShape(root: Record<string, unknown>): ParsedTurnkeyBalanceWebhook | null {
  const type = String(root.type ?? root.eventType ?? "").toUpperCase()
  if (!type.includes("BALANCE") && !root.balanceDiff && !root.balance_diff) {
    return null
  }

  const txHash = String(
    root.txHash ?? root.transactionHash ?? root.signature ?? root.hash ?? "",
  ).trim()
  if (!txHash) return null

  const address = String(
    root.address ?? root.walletAddress ?? root.accountAddress ?? root.toAddress ?? "",
  ).trim()
  if (!address) return null

  const eventId = String(root.id ?? root.eventId ?? root.idempotencyKey ?? `${txHash}:${address}`).trim()

  let amount = Number(root.amount ?? root.tokenAmount ?? 0)
  let amountMinor: string | null = null
  const minorRaw = root.amountMinor ?? root.amount_minor
  if (minorRaw != null && String(minorRaw).trim()) {
    amountMinor = String(minorRaw)
    const minor = Number(minorRaw)
    if (Number.isFinite(minor)) amount = minor / 1_000_000
  }

  if (!Number.isFinite(amount) || amount <= 0) return null

  const symbol = String(root.asset ?? root.symbol ?? root.token ?? "USDC")
  const asset = mapSymbolToAsset(symbol) ?? "USDC"

  return {
    kind: "deposit",
    data: {
      eventId,
      eventType: type || "BALANCE_CONFIRMED",
      txHash,
      address,
      asset,
      amount,
      amountMinor,
      decimals: 6,
      occurredAt: new Date().toISOString(),
      settledAt: new Date().toISOString(),
      counterpartyAddress: null,
      caip2: null,
      raw: root,
    },
  }
}

/** Strip Turnkey phase suffix so confirmed/finalized share one ledger id. */
export function stripTurnkeyBalancePhaseFromEventId(eventId: string): string {
  return String(eventId || "")
    .trim()
    .replace(/:balances:(confirmed|finalized)$/i, "")
}

/**
 * Stable `provider_transaction_id` for a deposit — one row per on-chain transfer,
 * regardless of confirmed vs finalized webhook delivery.
 */
export function turnkeyBalanceDepositProviderTransactionId(
  deposit: Pick<NormalizedTurnkeyBalanceDeposit, "txHash" | "eventId" | "asset">,
  addressForId: string,
): string {
  const txHash = String(deposit.txHash || "").trim()
  const address = String(addressForId || "").trim()
  const asset = String(deposit.asset || "").trim().toUpperCase()
  if (txHash && address && asset) {
    return `${txHash}:${address}:${asset}`
  }
  const stripped = stripTurnkeyBalancePhaseFromEventId(deposit.eventId)
  return stripped || deposit.eventId
}

export function parseTurnkeyBalanceWebhookPayload(payload: unknown): ParsedTurnkeyBalanceWebhook {
  const root = asRecord(payload)
  if (!root) return { kind: "unrecognized" }

  const type = String(root.type ?? "").trim().toLowerCase()
  if (type === "balances:confirmed" || type.startsWith("balances:")) {
    return parseBalancesConfirmedEnvelope(root)
  }

  const legacy = parseLegacyBalanceShape(root)
  if (legacy) return legacy

  return { kind: "unrecognized" }
}

export function isTurnkeyBalancesConfirmedWebhook(payload: unknown): boolean {
  const parsed = parseTurnkeyBalanceWebhookPayload(payload)
  return parsed.kind === "deposit" || parsed.kind === "withdraw"
}

export function turnkeyWebhookInboxIdentity(payload: unknown): {
  eventId: string
  eventType: string
} | null {
  const parsed = parseTurnkeyBalanceWebhookPayload(payload)
  if (parsed.kind === "deposit") {
    return { eventId: parsed.data.eventId, eventType: parsed.data.eventType }
  }
  if (parsed.kind === "withdraw") {
    return { eventId: parsed.eventId, eventType: parsed.eventType }
  }

  const root = asRecord(payload)
  if (!root) return null

  const eventId = String(
    root.id ?? root.eventId ?? root.activityId ?? root.hash ?? root.idempotencyKey ?? "",
  ).trim()
  if (!eventId) return null

  return {
    eventId,
    eventType: String(root.type ?? root.eventType ?? root.activityType ?? ""),
  }
}
