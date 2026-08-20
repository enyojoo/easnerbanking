import { isTurnkeyBalancesConfirmedWebhook } from "@/lib/turnkey/turnkey-balance-webhook-payload"

type TurnkeyPayload = Record<string, unknown>

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

function collectActivityTypes(payload: TurnkeyPayload): string[] {
  const types = new Set<string>()
  const add = (raw: unknown) => {
    const t = String(raw ?? "").trim()
    if (t) types.add(t.toUpperCase())
  }
  add(payload.type)
  add(payload.eventType)
  add(payload.activityType)
  walkObject(payload, (obj) => {
    add(obj.type)
    add(obj.activityType)
    add(obj.eventType)
  })
  return [...types]
}

/** Turnkey balance webhooks (`balances:confirmed` / `balances:finalized`) – not activity no-op. */
export function isTurnkeyBalanceConfirmedPayload(payload: unknown): boolean {
  if (isTurnkeyBalancesConfirmedWebhook(payload)) return true
  if (!payload || typeof payload !== "object") return false
  const p = payload as TurnkeyPayload
  const types = collectActivityTypes(p)
  if (
    types.some(
      (t) =>
        t.includes("BALANCE_CONFIRMED") ||
        t === "BALANCE_CONFIRMED_UPDATES" ||
        t.includes("BALANCE_FINALIZED") ||
        t === "BALANCE_FINALIZED_UPDATES",
    )
  ) {
    return true
  }
  const eventType = String(p.eventType ?? p.type ?? "").toUpperCase()
  if (eventType.includes("BALANCE_CONFIRMED") || eventType.includes("BALANCE_FINALIZED")) return true

  let hasBalanceSignal = false
  walkObject(p, (obj) => {
    if (
      obj.balanceDiff != null ||
      obj.balance_diff != null ||
      obj.confirmedBalance != null ||
      obj.confirmed_balance != null
    ) {
      hasBalanceSignal = true
    }
  })
  if (!hasBalanceSignal) return false

  const txHash = String(
    p.txHash ?? p.transactionHash ?? p.signature ?? p.hash ?? "",
  ).trim()
  const hasAmount =
    p.amountMinor != null ||
    p.amount_minor != null ||
    p.amount != null ||
    p.tokenAmount != null
  return Boolean(txHash && hasAmount)
}

const ACTIVITY_NOISE_TYPES = new Set([
  "ACTIVITY_TYPE_SOL_SEND_TRANSACTION",
  "ACTIVITY_TYPE_CREATE_WALLET",
  "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION",
  "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V7",
  "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V6",
  "ACTIVITY_TYPE_CREATE_API_KEYS",
  "ACTIVITY_TYPE_CREATE_USERS",
  "ACTIVITY_TYPE_CREATE_POLICY",
  "ACTIVITY_TYPE_UPDATE_POLICY",
  "ACTIVITY_TYPE_SET_ORGANIZATION_FEATURE",
  "ACTIVITY_TYPE_CREATE_WEBHOOK_ENDPOINT",
  "ACTIVITY_TYPE_UPDATE_WEBHOOK_ENDPOINT",
])

function isCreateNoiseType(t: string): boolean {
  const u = t.toUpperCase()
  if (ACTIVITY_NOISE_TYPES.has(u)) return true
  if (u.startsWith("ACTIVITY_TYPE_CREATE_")) return true
  if (u.startsWith("ACTIVITY_TYPE_UPDATE_WEBHOOK")) return true
  return false
}

function hasResolvableInboundAmount(payload: TurnkeyPayload): boolean {
  const minor =
    payload.amountMinor ?? payload.amount_minor ?? payload.tokenAmountMinor ?? payload.rawAmount
  if (minor != null) {
    const n = Number(minor)
    if (Number.isFinite(n) && n > 0) return true
  }
  const major = payload.amount ?? payload.tokenAmount ?? payload.value
  if (major != null) {
    const n = Number(major)
    if (Number.isFinite(n) && n > 0) return true
  }
  let nested = false
  walkObject(payload, (obj) => {
    if (nested) return
    const m = obj.amountMinor ?? obj.amount_minor ?? obj.tokenAmountMinor
    if (m != null && Number(m) > 0) nested = true
    const a = obj.amount ?? obj.tokenAmount
    if (a != null && Number(a) > 0) nested = true
  })
  return nested
}

/**
 * Activity webhooks (FEATURE_NAME_WEBHOOK) that must not create ledger rows.
 * Returns false for balance-confirmed payloads (Phase 2).
 */
export function isTurnkeyActivityNonLedgerEvent(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return true
  if (isTurnkeyBalanceConfirmedPayload(payload)) return false

  const p = payload as TurnkeyPayload
  const types = collectActivityTypes(p)
  if (types.some(isCreateNoiseType)) return true
  if (types.some((t) => t.includes("SOL_SEND"))) return true

  const explicitDir = String(
    p.direction ?? p.transferDirection ?? p.flowDirection ?? "",
  ).toLowerCase()
  if (explicitDir.includes("out")) return true

  const typeStr = types.join(" ")
  if (typeStr.includes("SEND") && !typeStr.includes("RECEIVE")) return true

  if (!hasResolvableInboundAmount(p)) {
    const typeLower = typeStr.toLowerCase()
    const looksInbound =
      typeLower.includes("deposit") ||
      typeLower.includes("receive") ||
      typeLower.includes("inbound") ||
      explicitDir.includes("in")
    if (!looksInbound) return true
  }

  return false
}
