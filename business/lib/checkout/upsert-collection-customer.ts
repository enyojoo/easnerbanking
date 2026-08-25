import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Attach a collection payment to a customer record. Invoices already have
 * first-class customers; links and website checkout only know an email – this
 * finds or creates the `business_customers` row so every buyer has one revenue
 * view across all surfaces.
 *
 * Best-effort by design: a customer-record hiccup must never fail a settlement.
 */
export async function upsertCollectionCustomer(
  admin: SupabaseClient,
  input: {
    businessId: string
    email: string | null | undefined
    name?: string | null
    currency?: string | null
  },
): Promise<{ customerId: string | null }> {
  const email = String(input.email ?? "").trim().toLowerCase()
  if (!email) return { customerId: null }

  try {
    const { data: existing } = await admin
      .from("business_customers")
      .select("id, name")
      .eq("business_id", input.businessId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      // Fill a missing name from the payment, never overwrite one the merchant set.
      const name = String(input.name ?? "").trim()
      if (name && !String(existing.name ?? "").trim()) {
        await admin
          .from("business_customers")
          .update({ name, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
      }
      return { customerId: String(existing.id) }
    }

    const { data: created } = await admin
      .from("business_customers")
      .insert({
        business_id: input.businessId,
        name: String(input.name ?? "").trim() || email,
        email,
        currency: String(input.currency ?? "USD").toUpperCase(),
        status: "active",
      })
      .select("id")
      .single()

    return { customerId: created?.id ? String(created.id) : null }
  } catch {
    return { customerId: null }
  }
}
