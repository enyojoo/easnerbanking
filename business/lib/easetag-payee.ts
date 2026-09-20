import type { SupabaseClient } from "@supabase/supabase-js"
import { isUndefinedEasetagColumnError } from "@/lib/easetag-global"
import { normalizeEasetag } from "@/lib/easetag-validation"

export type ResolvedEasetagPayee =
  | { kind: "user"; userId: string; easetag: string }
  | { kind: "business"; businessId: string; ownerUserId: string | null; easetag: string }
  | { kind: "platform_customer"; customerId: string; accountId: string; easetag: string }

export async function resolveEasetagPayee(
  admin: SupabaseClient,
  easetag: string,
  currency: string,
): Promise<ResolvedEasetagPayee | null> {
  const clean = normalizeEasetag(easetag)
  if (!clean) return null
  const ledgerCurrency = currency.trim().toUpperCase() === "EUR" ? "EUR" : "USD"

  const { data: user, error: userErr } = await admin
    .from("users")
    .select("id, easetag")
    .eq("easetag", clean)
    .maybeSingle()
  if (userErr && !isUndefinedEasetagColumnError(userErr)) throw new Error(userErr.message)
  if (user?.id && !(userErr && isUndefinedEasetagColumnError(userErr))) {
    return { kind: "user", userId: String(user.id), easetag: String(user.easetag || clean) }
  }

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, easetag")
    .eq("easetag", clean)
    .maybeSingle()
  if (bizErr && !isUndefinedEasetagColumnError(bizErr)) throw new Error(bizErr.message)
  if (biz?.id && !(bizErr && isUndefinedEasetagColumnError(bizErr))) {
    const { data: owner } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", biz.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    return {
      kind: "business",
      businessId: String(biz.id),
      ownerUserId: owner?.id ? String(owner.id) : null,
      easetag: String(biz.easetag || clean),
    }
  }

  const { data: customer, error: cusErr } = await admin
    .from("platform_customers")
    .select("id, easetag")
    .eq("easetag", clean)
    .maybeSingle()
  if (cusErr) {
    if (isUndefinedEasetagColumnError(cusErr)) return null
    throw new Error(cusErr.message)
  }
  if (!customer?.id) return null
  const { data: account } = await admin
    .from("platform_accounts")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("currency", ledgerCurrency)
    .maybeSingle()
  if (!account?.id) return null
  return {
    kind: "platform_customer",
    customerId: String(customer.id),
    accountId: String(account.id),
    easetag: String(customer.easetag || clean),
  }
}
