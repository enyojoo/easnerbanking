/**
 * Canonical `public.virtual_accounts` column usage (Noah + Grid bank receive rails).
 *
 * | Currency | Rows | Columns |
 * |----------|------|---------|
 * | USD | **one** merged row (provider_virtual_account_id = preferred ACH PM or Grid account key) | account_number, routing_number (ACH/Wire), bic (SWIFT) |
 * | EUR | one per SEPA PM / Grid account | iban, bic |
 * | GBP | one per PM / Grid account | account_number, sort_code |
 *
 * Legacy per-rail USD rows are pruned on sync (`persist-account-data.ts`).
 */

import type { NoahBankRail } from "./payment-method-map"

export type VirtualAccountDbRow = {
  provider_virtual_account_id: string | null
  currency: string | null
  account_number: string | null
  routing_number: string | null
  iban: string | null
  bic: string | null
  sort_code: string | null
  bank_name: string | null
  bank_address: string | null
  account_holder_name: string | null
  provider?: string | null
}

export type PickPreferredVirtualAccountOpts = {
  /** When set, prefer rows from this provider (e.g. business Grid KYB). */
  preferProvider?: "grid" | "noah"
}

export function parseRailFromPmId(pmId: string | null | undefined): NoahBankRail | null {
  const id = String(pmId ?? "").toLowerCase()
  if (id.includes("/ach/")) return "ach"
  if (id.includes("/wire/") || id.includes("/fedwire/")) return "wire"
  if (id.includes("/swift/")) return "swift"
  if (id.includes("/sepa/")) return "sepa"
  return null
}

export function isUsdSwiftRow(row: Pick<VirtualAccountDbRow, "provider_virtual_account_id">): boolean {
  return parseRailFromPmId(row.provider_virtual_account_id) === "swift"
}

/** USD should be a single merged row; legacy multi-row falls back to ACH → Wire. Grid preferred for business. */
export function pickPreferredVirtualAccountRow(
  rows: VirtualAccountDbRow[],
  currency: "usd" | "eur" | "gbp",
  opts?: PickPreferredVirtualAccountOpts,
): VirtualAccountDbRow | null {
  if (rows.length === 0) return null

  let pool = rows
  if (opts?.preferProvider) {
    const preferred = rows.filter(
      (r) => String(r.provider ?? "").trim().toLowerCase() === opts.preferProvider,
    )
    if (preferred.length > 0) pool = preferred
  }

  if (currency !== "usd") return pool[0] ?? null
  if (pool.length === 1) return pool[0] ?? null

  const byRail = (rail: NoahBankRail) =>
    pool.find((r) => parseRailFromPmId(r.provider_virtual_account_id) === rail)

  return byRail("ach") ?? byRail("wire") ?? pool.find((r) => !isUsdSwiftRow(r)) ?? pool[0] ?? null
}
