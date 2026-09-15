import type { SupabaseClient } from "@supabase/supabase-js"
import type { BridgeVirtualAccount } from "./virtual-accounts"

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim()
    if (text) return text
  }
  return null
}

function sourceCurrency(va: BridgeVirtualAccount): "USD" | "EUR" | null {
  const fromDest = String(va.destination?.currency ?? "").toLowerCase()
  if (fromDest === "eurc") return "EUR"
  if (fromDest === "usdc") return "USD"
  const fromSource = String(va.source_deposit_instructions?.currency ?? "").toLowerCase()
  if (fromSource === "eur") return "EUR"
  if (fromSource === "usd") return "USD"
  return null
}

/** Bridge USD uses `bank_account_number` / `bank_routing_number`; EUR uses `iban`. */
export function bridgeVaBankDetails(va: BridgeVirtualAccount): {
  currency: "USD" | "EUR" | null
  accountNumber: string | null
  routingNumber: string | null
  iban: string | null
  bic: string | null
  bankName: string | null
  bankAddress: string | null
  accountHolderName: string | null
} {
  const inst = va.source_deposit_instructions ?? {}
  return {
    currency: sourceCurrency(va),
    accountNumber: firstNonEmpty(inst.account_number, inst.bank_account_number),
    routingNumber: firstNonEmpty(inst.routing_number, inst.bank_routing_number),
    iban: firstNonEmpty(inst.iban),
    bic: firstNonEmpty(inst.bic, inst.swift),
    bankName: firstNonEmpty(inst.bank_name),
    bankAddress: firstNonEmpty(inst.bank_address),
    accountHolderName: firstNonEmpty(inst.account_holder_name, inst.bank_beneficiary_name),
  }
}

export async function persistBridgeVirtualAccount(input: {
  admin: SupabaseClient
  userId: string
  businessId: string | null
  customerId: string
  account: BridgeVirtualAccount
}): Promise<boolean> {
  const details = bridgeVaBankDetails(input.account)
  if (!details.currency) return false
  if (!details.accountNumber && !details.iban) {
    console.warn("[bridge] skip persist: missing account number/iban", {
      vaId: input.account.id,
      currency: details.currency,
    })
    return false
  }

  const now = new Date().toISOString()
  const patch = {
    user_id: input.userId,
    business_id: input.businessId,
    provider: "bridge" as const,
    status: "active" as const,
    settlement_target: "turnkey" as const,
    provider_virtual_account_id: input.account.id,
    provider_customer_id: input.customerId,
    currency: details.currency,
    account_number: details.accountNumber,
    routing_number: details.routingNumber,
    iban: details.iban,
    bic: details.bic,
    sort_code: null as string | null,
    bank_name: details.bankName,
    bank_address: details.bankAddress,
    account_holder_name: details.accountHolderName,
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
    if (error) {
      console.warn("[bridge] persist virtual account update failed", error.message)
      return false
    }
    return true
  }
  const { error } = await input.admin.from("virtual_accounts").insert(patch)
  if (error) {
    console.warn("[bridge] persist virtual account insert failed", error.message)
    return false
  }
  return true
}
