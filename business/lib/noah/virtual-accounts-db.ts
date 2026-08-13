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
    bic: row.bic ?? undefined,
    bankName: row.bank_name ?? undefined,
    bankAddress: row.bank_address ?? undefined,
    accountHolderName: row.account_holder_name ?? undefined,
    status: "active",
  }
}

async function readUserMirroredVirtualAccountId(
  admin: SupabaseClient,
  opts: {
    subjectUserId: string
    currency: "usd" | "eur" | "gbp"
  },
): Promise<string | null> {
  const columnByCurrency = {
    usd: "noah_usd_virtual_account_id",
    eur: "noah_eur_virtual_account_id",
    gbp: "noah_gbp_virtual_account_id",
  } as const
  const col = columnByCurrency[opts.currency]
  const { data } = await admin.from("users").select(col).eq("id", opts.subjectUserId).maybeSingle()
  const id = (data as Record<string, string | null> | null)?.[col]
  return id?.trim() || null
}

/** True when an active fiat VA row exists in `virtual_accounts` (Grid or Noah). */
export async function hasActiveVirtualAccountInDb(
  admin: SupabaseClient,
  input: {
    currency: "usd" | "eur" | "gbp"
    userId: string
    businessId?: string | null
  },
): Promise<boolean> {
  const display = await getVirtualAccountDisplayFromDb(admin, input)
  return Boolean(display?.hasAccount)
}

/**
 * Read cached fiat virtual account details from `public.virtual_accounts`.
 * Individual users: may prefer row matching legacy mirror id on `users`.
 * Businesses: rows only (Grid + Noah live in `virtual_accounts`).
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
  // Grid persists lowercase (`usd`); Noah/legacy may use `USD`. Match both.
  const currencyKeys = Array.from(new Set([fiat, fiat.toLowerCase()]))
  let q = admin
    .from("virtual_accounts")
    .select(
      "noah_virtual_account_id,currency,account_number,routing_number,iban,bic,sort_code,bank_name,bank_address,account_holder_name,updated_at,provider,status",
    )
    .neq("status", "retired")
    .neq("status", "inactive")
    .in("currency", currencyKeys)
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

  const mirroredPmId = input.businessId
    ? null
    : await readUserMirroredVirtualAccountId(admin, {
        subjectUserId: input.userId,
        currency,
      })
  const rows = data as VirtualAccountDbRow[]
  const row =
    (mirroredPmId
      ? rows.find((r) => String(r.noah_virtual_account_id ?? "").trim() === mirroredPmId)
      : null) ?? pickPreferredVirtualAccountRow(rows, currency)
  if (!row) return null

  const hasDetails =
    Boolean(row.account_number) ||
    Boolean(row.iban) ||
    Boolean(row.routing_number) ||
    Boolean(row.bank_name)
  if (!hasDetails) return null

  return rowToDisplay(row, currency)
}
