import { isNoahBankOnrampOrchestrationOutLeg } from "@/lib/noah/bank-onramp-tx"

export type LedgerListCursor = {
  occurred_at: string | null
  created_at: string
  id: string
}

export function encodeLedgerListCursor(cursor: LedgerListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

export function decodeLedgerListCursor(raw: string | null | undefined): LedgerListCursor | null {
  const trimmed = String(raw ?? "").trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(Buffer.from(trimmed, "base64url").toString("utf8")) as LedgerListCursor
    if (!parsed?.id || !parsed.created_at) return null
    return {
      occurred_at: parsed.occurred_at ?? null,
      created_at: String(parsed.created_at),
      id: String(parsed.id),
    }
  } catch {
    return null
  }
}

/** Keyset filter for `(occurred_at DESC NULLS LAST, created_at DESC, id DESC)`. */
export function applyLedgerListCursorFilter<T extends { or: (expr: string) => T }>(
  query: T,
  cursor: LedgerListCursor,
): T {
  const occ = cursor.occurred_at
  const created = cursor.created_at
  const id = cursor.id
  if (occ) {
    return query.or(
      `occurred_at.lt.${occ},and(occurred_at.eq.${occ},created_at.lt.${created}),and(occurred_at.eq.${occ},created_at.eq.${created},id.lt.${id})`,
    )
  }
  return query.or(`and(occurred_at.is.null,created_at.lt.${created}),and(occurred_at.is.null,created_at.eq.${created},id.lt.${id})`)
}

export function buildNextLedgerListCursor(
  rows: Record<string, unknown>[],
  limit: number,
): { visible: Record<string, unknown>[]; nextCursor: string | null } {
  const hasMore = rows.length > limit
  const visible = hasMore ? rows.slice(0, limit) : rows
  if (!hasMore || visible.length === 0) {
    return { visible, nextCursor: null }
  }
  const last = visible[visible.length - 1]!
  const next: LedgerListCursor = {
    occurred_at: last.occurred_at != null ? String(last.occurred_at) : null,
    created_at: String(last.created_at ?? new Date(0).toISOString()),
    id: String(last.id),
  }
  return { visible, nextCursor: encodeLedgerListCursor(next) }
}

/** Whether a row should be excluded from user-facing feeds (write-time denormalization). */
export function resolveHiddenFromFeed(metadata: unknown, payload?: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    if (payload && typeof payload === "object" && isNoahBankOnrampOrchestrationOutLeg(payload as Record<string, unknown>)) {
      return true
    }
    return false
  }
  const m = metadata as Record<string, unknown>
  if (m.easetag_settlement_leg === true || m.easetag_p2p_chain_mirror === true || m.suppress_in_feed === true) return true
  if (m.global_payout_settlement_leg === true) return true
  if (m.global_payout_orchestration_in_leg === true) return true
  if (m.noah_orchestration_settlement_leg === true) return true
  if (m.noah_orchestration_settlement_in_leg === true) return true
  if (m.noah_bank_onramp_chain_mirror === true) return true
  if (m.yc_fund_balance_chain_mirror === true) return true
  if (m.global_payout_refund_mirror === true) return true
  if (m.grid_va_turnkey_chain_mirror === true) return true
  if (payload && typeof payload === "object" && isNoahBankOnrampOrchestrationOutLeg(payload as Record<string, unknown>)) {
    return true
  }
  return false
}
