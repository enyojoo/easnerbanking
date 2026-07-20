/**
 * YC receive deposit window — time to complete pay-in after POST /receive is accepted.
 * @see https://docs.yellowcard.engineering/docs/channels-api (Receives → Expiry Time)
 */

import { resolveYcQuoteExpiresAt } from "./yc-pricing"

export type YcPayInRailForWindow = "bank_transfer" | "mobile_money"

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** MoMo receive channels: 5–10 min — use 10 min. */
const MOMO_WINDOW_MS = 10 * MIN

/**
 * Bank receive deposit windows by country (ISO-2).
 * Manual bank corridors use 5 days unless noted in YC docs.
 */
const BANK_DEPOSIT_WINDOW_MS: Record<string, number> = {
  NG: 4 * HOUR,
  ZA: 30 * MIN,
  GA: 3 * DAY,
  BW: 5 * DAY,
  CG: 5 * DAY,
  MW: 5 * DAY,
  RW: 5 * DAY,
  TZ: 5 * DAY,
  UG: 5 * DAY,
  ZM: 5 * DAY,
}

export type ResolveYcPayInDepositExpiresAtInput = {
  /** Quote lock / receive accept time. */
  lockedAt?: string | Date | null
  /** Expiry from YC POST /receive when returned. */
  preferredExpiresAt?: string | null
  country: string
  payInRail: YcPayInRailForWindow
}

export function resolveYcChannelDepositWindowMs(
  country: string,
  payInRail: YcPayInRailForWindow,
): number | null {
  const c = String(country ?? "").trim().toUpperCase()
  if (!c) return null
  if (payInRail === "mobile_money") return MOMO_WINDOW_MS
  return BANK_DEPOSIT_WINDOW_MS[c] ?? 5 * DAY
}

/** ISO expiry for the user deposit window (distinct from preview quote TTL). */
export function resolveYcPayInDepositExpiresAt(input: ResolveYcPayInDepositExpiresAtInput): string {
  const lockedMs = input.lockedAt ? new Date(input.lockedAt).getTime() : Date.now()
  const baseMs = Number.isFinite(lockedMs) ? lockedMs : Date.now()
  const windowMs = resolveYcChannelDepositWindowMs(input.country, input.payInRail)
  const corridorExpiresMs = windowMs != null ? baseMs + windowMs : null

  const preferred = String(input.preferredExpiresAt ?? "").trim()
  const preferredMs = preferred ? new Date(preferred).getTime() : NaN

  if (corridorExpiresMs != null) {
    if (Number.isFinite(preferredMs)) {
      // YC may echo preview quote TTL; deposit window is at least the corridor minimum.
      return new Date(Math.max(preferredMs, corridorExpiresMs)).toISOString()
    }
    return new Date(corridorExpiresMs).toISOString()
  }

  if (Number.isFinite(preferredMs)) {
    return new Date(preferredMs).toISOString()
  }

  return resolveYcQuoteExpiresAt()
}
