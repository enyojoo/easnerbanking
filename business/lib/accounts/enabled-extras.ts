import { createSupabaseAdmin } from "@/lib/supabase/admin"
import type { NoahCustomerScope } from "@/lib/noah/customer-id"

export async function getEnabledExtraCurrencies(
  subjectUserId: string,
  scope: NoahCustomerScope,
): Promise<string[]> {
  const admin = createSupabaseAdmin()
  if (scope === "business") {
    const { data: u } = await admin
      .from("users")
      .select("easner_organization_id")
      .eq("id", subjectUserId)
      .maybeSingle()
    const orgId = u?.easner_organization_id as string | undefined
    if (!orgId) return []
    const { data: org } = await admin
      .from("easner_organizations")
      .select("enabled_extra_account_currencies")
      .eq("id", orgId)
      .maybeSingle()
    return (org?.enabled_extra_account_currencies as string[] | undefined) ?? []
  }
  const { data: u } = await admin
    .from("users")
    .select("enabled_extra_account_currencies")
    .eq("id", subjectUserId)
    .maybeSingle()
  return (u?.enabled_extra_account_currencies as string[] | undefined) ?? []
}

export async function appendEnabledExtraCurrency(
  subjectUserId: string,
  scope: NoahCustomerScope,
  code: string,
): Promise<void> {
  const upper = code.toUpperCase()
  const admin = createSupabaseAdmin()
  const existing = await getEnabledExtraCurrencies(subjectUserId, scope)
  if (existing.map((c) => c.toUpperCase()).includes(upper)) return

  const next = [...existing, upper]

  if (scope === "business") {
    const { data: u } = await admin
      .from("users")
      .select("easner_organization_id")
      .eq("id", subjectUserId)
      .maybeSingle()
    const orgId = u?.easner_organization_id as string | undefined
    if (!orgId) {
      await admin
        .from("users")
        .update({ enabled_extra_account_currencies: next, updated_at: new Date().toISOString() })
        .eq("id", subjectUserId)
      return
    }
    await admin
      .from("easner_organizations")
      .update({ enabled_extra_account_currencies: next })
      .eq("id", orgId)
    return
  }

  await admin
    .from("users")
    .update({ enabled_extra_account_currencies: next, updated_at: new Date().toISOString() })
    .eq("id", subjectUserId)
}
