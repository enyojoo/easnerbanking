import type { VirtualAccountDisplay } from "@/lib/noah/payment-method-map"
import { GRID_USD_SPONSOR_BANK } from "./usd-sponsor-bank"

export type GridVaEnrichmentInput = {
  provider?: string | null
  currency: "usd" | "eur" | "gbp"
  accountHolderNameFallback?: string | null
}

function coalesceNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = String(value ?? "").trim()
    if (trimmed) return trimmed
  }
  return undefined
}

/** Fill Grid USD sponsor bank + business holder name when Grid API omits them. */
export function enrichGridUsdVirtualAccountDisplay(
  display: VirtualAccountDisplay,
  input: GridVaEnrichmentInput,
): VirtualAccountDisplay {
  const provider = String(input.provider ?? "").trim().toLowerCase()
  if (provider !== "grid" || input.currency !== "usd") {
    return display
  }

  return {
    ...display,
    provider: "grid",
    bankName: coalesceNonEmpty(display.bankName, GRID_USD_SPONSOR_BANK.bankName),
    bankAddress: coalesceNonEmpty(display.bankAddress, GRID_USD_SPONSOR_BANK.bankAddress),
    accountHolderName: coalesceNonEmpty(display.accountHolderName, input.accountHolderNameFallback),
    bic: undefined,
  }
}

export type GridUsdVirtualAccountPersistFields = {
  bank_name: string | null
  bank_address: string | null
  account_holder_name: string | null
  bic: string | null
}

/** DB patch enrichment for Grid USD rows on persist (fill nulls only). */
export function enrichGridUsdVirtualAccountPersistFields(
  fields: {
    bank_name: string | null
    bank_address: string | null
    account_holder_name: string | null
    bic: string | null
    currency: string
  },
  accountHolderNameFallback?: string | null,
): GridUsdVirtualAccountPersistFields | null {
  const currency = String(fields.currency ?? "").trim().toLowerCase()
  if (currency !== "usd") return null

  return {
    bank_name: fields.bank_name?.trim() || GRID_USD_SPONSOR_BANK.bankName,
    bank_address: fields.bank_address?.trim() || GRID_USD_SPONSOR_BANK.bankAddress,
    account_holder_name:
      fields.account_holder_name?.trim() ||
      String(accountHolderNameFallback ?? "").trim() ||
      null,
    bic: fields.bic?.trim() || GRID_USD_SPONSOR_BANK.bic,
  }
}
