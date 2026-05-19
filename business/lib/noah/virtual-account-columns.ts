/**
 * Canonical `public.virtual_accounts` column usage (Noah PayinTo bank VAs).
 *
 * | Currency | Rows | Columns |
 * |----------|------|---------|
 * | USD | **one** merged row (canonical id = preferred ACH PM) | account_number, routing_number (ACH/Wire), bic (SWIFT) |
 * | EUR | one per SEPA PM | iban, bic |
 * | GBP | one per PM | account_number, sort_code |
 *
 * Legacy per-rail USD rows are pruned on sync (`persist-account-data.ts`).
 */

import type { NoahBankRail } from "./payment-method-map"

export type VirtualAccountDbRow = {
  noah_virtual_account_id: string | null
  currency: string | null
  account_number: string | null
  routing_number: string | null
  iban: string | null
  bic: string | null
  sort_code: string | null
  bank_name: string | null
  bank_address: string | null
  account_holder_name: string | null
}

export function parseRailFromPmId(pmId: string | null | undefined): NoahBankRail | null {
  const id = String(pmId ?? "").toLowerCase()
  if (id.includes("/ach/")) return "ach"
  if (id.includes("/wire/") || id.includes("/fedwire/")) return "wire"
  if (id.includes("/swift/")) return "swift"
  if (id.includes("/sepa/")) return "sepa"
  return null
}

export function isUsdSwiftRow(row: Pick<VirtualAccountDbRow, "noah_virtual_account_id">): boolean {
  return parseRailFromPmId(row.noah_virtual_account_id) === "swift"
}

/** USD should be a single merged row; legacy multi-row falls back to ACH → Wire. */
export function pickPreferredVirtualAccountRow(
  rows: VirtualAccountDbRow[],
  currency: "usd" | "eur" | "gbp",
): VirtualAccountDbRow | null {
  if (rows.length === 0) return null
  if (currency !== "usd") return rows[0] ?? null
  if (rows.length === 1) return rows[0] ?? null

  const byRail = (rail: NoahBankRail) =>
    rows.find((r) => parseRailFromPmId(r.noah_virtual_account_id) === rail)

  return byRail("ach") ?? byRail("wire") ?? rows.find((r) => !isUsdSwiftRow(r)) ?? rows[0] ?? null
}
