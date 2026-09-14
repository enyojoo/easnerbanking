import type { SupabaseClient } from "@supabase/supabase-js"
import type { BridgeVirtualAccount } from "./virtual-accounts"

function sourceCurrency(va: BridgeVirtualAccount): "USD" | "EUR" | null {
  const fromDest = String(va.destination?.currency ?? "").toLowerCase()
  if (fromDest === "eurc") return "EUR"
  if (fromDest === "usdc") return "USD"
  const fromSource = String(va.source_deposit_instructions?.currency ?? "").toLowerCase()
  if (fromSource === "eur") return "EUR"
  if (fromSource === "usd") return "USD"
  return null
}

export async function persistBridgeVirtualAccount(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  customerId: string
  account: BridgeVirtualAccount
}): Promise<boolean> {
  const currency = sourceCurrency(input.account)
  if (!currency) return false
  const inst = input.account.source_deposit_instructions ?? {}
  const accountNumber = String(inst.account_number ?? "").trim() || null
  const iban = String(inst.iban ?? "").trim() || null
  if (!accountNumber && !iban) return false

  const now = new Date().toISOString()
  const patch = {
    user_id: input.userId,
    business_id: input.businessId,
    provider: "bridge" as const,
    status: "active" as const,
    settlement_target: "turnkey" as const,
    provider_virtual_account_id: input.account.id,
    provider_customer_id: input.customerId,
    currency,
    account_number: accountNumber,
    routing_number: String(inst.routing_number ?? "").trim() || null,
    iban,
    bic: String(inst.bic ?? inst.swift ?? "").trim() || null,
    sort_code: null as string | null,
    bank_name: String(inst.bank_name ?? "").trim() || null,
    bank_address: String(inst.bank_address ?? "").trim() || null,
    account_holder_name: String(inst.account_holder_name ?? "").trim() || null,
    updated_at: now,
  }

  let existingQuery = input.admin
    .from("virtual_accounts")
    .select("id")
    .eq("provider", "bridge")
    .eq("provider_virtual_account_id", input.account.id)
  existingQuery = input.businessId
    ? existingQuery.eq("business_id", input.businessId)
    : existingQuery.eq("user_id", input.userId).is("business_id", null)
  const { data: existing } = await existingQuery.maybeSingle()

  if (existing?.id) {
    const { error } = await input.admin.from("virtual_accounts").update(patch).eq("id", existing.id)
    return !error
  }
  const { error } = await input.admin.from("virtual_accounts").insert(patch)
  return !error
}
