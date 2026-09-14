import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

function parseKind(raw: string): "user" | "business" | null {
  if (raw === "user" || raw === "business") return raw
  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response
  const { kind: kindRaw, id } = await params
  const kind = parseKind(kindRaw)
  if (!kind || !id) return NextResponse.json({ error: "Invalid subject" }, { status: 400 })

  const admin = createSupabaseAdmin()
  let balancesQuery = admin
    .from("wallet_balances")
    .select("currency,available_balance")
    .order("currency", { ascending: true })
  let vaQuery = admin.from("virtual_accounts").select("*").order("currency", { ascending: true })

  if (kind === "business") {
    balancesQuery = balancesQuery.eq("business_id", id)
    vaQuery = vaQuery.eq("business_id", id)
  } else {
    balancesQuery = balancesQuery.eq("user_id", id).is("business_id", null)
    vaQuery = vaQuery.eq("user_id", id).is("business_id", null)
  }

  const extraTable = kind === "business" ? "businesses" : "users"
  const [{ data: balances }, { data: vas }, { data: extraRow }] = await Promise.all([
    balancesQuery,
    vaQuery,
    admin.from(extraTable).select("enabled_extra_account_currencies").eq("id", id).maybeSingle(),
  ])

  return NextResponse.json({
    balances: (balances ?? []).map((row) => ({
      currency: String(row.currency ?? "").toUpperCase(),
      available: Number(row.available_balance ?? 0),
    })),
    virtualAccounts: (vas ?? []).map((row) => ({
      id: String(row.id),
      provider: String(row.provider ?? ""),
      currency: String(row.currency ?? "").toUpperCase(),
      status: row.status ? String(row.status) : null,
      settlementTarget: row.settlement_target ? String(row.settlement_target) : null,
      accountNumber: row.account_number ? String(row.account_number) : null,
      routingNumber: row.routing_number ? String(row.routing_number) : null,
      iban: row.iban ? String(row.iban) : null,
      bic: row.bic ? String(row.bic) : null,
      sortCode: row.sort_code ? String(row.sort_code) : null,
      bankName: row.bank_name ? String(row.bank_name) : null,
      accountHolderName: row.account_holder_name ? String(row.account_holder_name) : null,
      providerVirtualAccountId: row.provider_virtual_account_id
        ? String(row.provider_virtual_account_id)
        : null,
      providerCustomerId: row.provider_customer_id ? String(row.provider_customer_id) : null,
    })),
    extraCurrencies: Array.isArray(extraRow?.enabled_extra_account_currencies)
      ? (extraRow.enabled_extra_account_currencies as string[])
      : [],
  })
}
