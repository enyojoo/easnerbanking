import type { SupabaseClient } from "@supabase/supabase-js"
import type { VirtualAccountDisplay } from "./payment-method-map"

type VirtualAccountRow = {
  currency: string | null
  account_number: string | null
  routing_number: string | null
  iban: string | null
  bic: string | null
  bank_name: string | null
  bank_address: string | null
  account_holder_name: string | null
}

function normalizeCurrencyCode(raw: string): "usd" | "eur" | "gbp" | null {
  const c = String(raw || "").trim().toUpperCase()
  if (c === "USD") return "usd"
  if (c === "EUR") return "eur"
  if (c === "GBP") return "gbp"
  return null
}

function rowToDisplay(row: VirtualAccountRow, currency: "usd" | "eur" | "gbp"): VirtualAccountDisplay {
  const routingNumber = row.routing_number ?? undefined
  return {
    hasAccount: true,
    currency,
    accountNumber: row.account_number ?? undefined,
    routingNumber,
    sortCode: currency === "gbp" && routingNumber ? routingNumber : undefined,
    iban: row.iban ?? undefined,
    bic: row.bic ?? undefined,
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
      "currency,account_number,routing_number,iban,bic,bank_name,bank_address,account_holder_name",
    )
    .eq("currency", fiat)
    .order("updated_at", { ascending: false })
    .limit(1)

  if (input.businessId) {
    q = q.eq("business_id", input.businessId)
  } else {
    q = q.eq("user_id", input.userId).is("business_id", null)
  }

  const { data, error } = await q.maybeSingle()
  if (error || !data) return null

  const currency = normalizeCurrencyCode(String(data.currency ?? fiat))
  if (!currency) return null

  const hasDetails =
    Boolean(data.account_number) ||
    Boolean(data.iban) ||
    Boolean(data.routing_number) ||
    Boolean(data.bank_name)
  if (!hasDetails) return null

  return rowToDisplay(data as VirtualAccountRow, currency)
}
