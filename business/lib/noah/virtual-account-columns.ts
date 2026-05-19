/**
 * Canonical `public.virtual_accounts` column usage (Noah PayinTo bank VAs).
 * Rail is encoded in `noah_virtual_account_id` (e.g. Bank/Ach/USD/...).
 *
 * | Currency | ID segment | Columns stored |
 * |----------|------------|----------------|
 * | USD      | /Ach/, /Wire/ | account_number, routing_number |
 * | USD      | /Swift/ | account_number, bic |
 * | EUR      | /Sepa/ | iban, bic |
 * | GBP      | — | account_number, sort_code |
 *
 * Receive/API display picks ACH → Wire for USD (see pickPreferredVirtualAccountRow).
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

/** Prefer ACH, then Wire; SWIFT rows stay in DB but are not used for USD receive display. */
export function pickPreferredVirtualAccountRow(
  rows: VirtualAccountDbRow[],
  currency: "usd" | "eur" | "gbp",
): VirtualAccountDbRow | null {
  if (rows.length === 0) return null
  if (currency !== "usd") return rows[0] ?? null

  const byRail = (rail: NoahBankRail) =>
    rows.find((r) => parseRailFromPmId(r.noah_virtual_account_id) === rail)

  return byRail("ach") ?? byRail("wire") ?? rows.find((r) => !isUsdSwiftRow(r)) ?? rows[0] ?? null
}
