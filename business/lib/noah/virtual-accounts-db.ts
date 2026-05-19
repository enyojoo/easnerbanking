import type { SupabaseClient } from "@supabase/supabase-js"
import { isUsAbaRoutingNumber, looksLikeSwiftBic, type VirtualAccountDisplay } from "./payment-method-map"
import {
  isUsdSwiftRow,
  pickPreferredVirtualAccountRow,
  type VirtualAccountDbRow,
} from "./virtual-account-columns"

function normalizeCurrencyCode(raw: string): "usd" | "eur" | "gbp" | null {
  const c = String(raw || "").trim().toUpperCase()
  if (c === "USD") return "usd"
  if (c === "EUR") return "eur"
  if (c === "GBP") return "gbp"
  return null
}

function usdRoutingForDisplay(row: VirtualAccountDbRow): string | undefined {
  if (isUsdSwiftRow(row)) return undefined
  const raw = row.routing_number?.trim()
  if (!raw || looksLikeSwiftBic(raw) || !isUsAbaRoutingNumber(raw)) return undefined
  return raw
}

function rowToDisplay(row: VirtualAccountDbRow, currency: "usd" | "eur" | "gbp"): VirtualAccountDisplay {
  const routingNumber =
    currency === "usd"
      ? usdRoutingForDisplay(row)
      : currency === "gbp"
        ? undefined
        : (row.routing_number ?? undefined)
  const sortCode = currency === "gbp" ? (row.sort_code ?? undefined) : undefined

  return {
    hasAccount: true,
    currency,
    accountNumber: row.account_number ?? undefined,
    routingNumber,
    sortCode,
    iban: row.iban ?? undefined,
    bic: currency === "usd" ? undefined : (row.bic ?? undefined),
    bankName: row.bank_name ?? undefined,
    bankAddress: row.bank_address ?? undefined,
    accountHolderName: row.account_holder_name ?? undefined,
    status: "active",
  }
}

/**
 * Read cached fiat virtual account details from `public.virtual_accounts`.
 * Returns null when no row exists for the scope + currency.
 */
export async function getVirtualAccountDisplayFromDb(
  admin: SupabaseClient,
  input: {
    currency: "usd" | "eur" | "gbp"
    userId: string
    businessId?: string | null
  },
): Promise<VirtualAccountDisplay | null> {
  const fiat = input.currency.toUpperCase()
  let q = admin
    .from("virtual_accounts")
    .select(
      "noah_virtual_account_id,currency,account_number,routing_number,iban,bic,sort_code,bank_name,bank_address,account_holder_name,updated_at",
    )
    .eq("currency", fiat)
    .order("updated_at", { ascending: false })
    .limit(8)

  if (input.businessId) {
    q = q.eq("business_id", input.businessId)
  } else {
    q = q.eq("user_id", input.userId).is("business_id", null)
  }

  const { data, error } = await q
  if (error || !data?.length) return null

  const currency = normalizeCurrencyCode(String(data[0]?.currency ?? fiat))
  if (!currency) return null

  const row = pickPreferredVirtualAccountRow(data as VirtualAccountDbRow[], currency)
  if (!row) return null

  const hasDetails =
    Boolean(row.account_number) ||
    Boolean(row.iban) ||
    Boolean(row.routing_number) ||
    Boolean(row.bank_name)
  if (!hasDetails) return null

  return rowToDisplay(row, currency)
}
