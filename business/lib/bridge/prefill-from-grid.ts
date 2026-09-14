import type { SupabaseClient } from "@supabase/supabase-js"
import { loadGridBusinessProfile } from "@/lib/grid/ensure-grid-business-customer"
import { ensureKybApplication, listKybPeople } from "@/lib/grid/kyb-application-store"
import { bridgeFetch } from "./http"

/** Best-effort Grid packet → Bridge customer prefill. Hosted KYB still required. */
export async function prefillBridgeBusinessCustomer(input: {
  admin: SupabaseClient
  businessId: string
  customerId: string
}): Promise<void> {
  const customerId = input.customerId.trim()
  if (!customerId) return

  const profile = await loadGridBusinessProfile(input.admin, input.businessId).catch(() => null)
  const application = await ensureKybApplication(input.admin, input.businessId).catch(() => null)
  const people = application
    ? await listKybPeople(input.admin, application.id, true).catch(() => [])
    : []

  const legalName = String(profile?.legalName ?? "").trim()
  const country = String(profile?.country ?? "").trim().toUpperCase()
  const address = {
    street_line_1: String(profile?.addressLine1 ?? "").trim() || undefined,
    city: String(profile?.city ?? "").trim() || undefined,
    subdivision: String(profile?.state ?? "").trim() || undefined,
    postal_code: String(profile?.postalCode ?? "").trim() || undefined,
    country: country || undefined,
  }
  const hasAddress = Boolean(address.street_line_1 || address.city || address.country)
  const associatedPersons = people.slice(0, 8).map((person) => {
    return {
      first_name: String(person.firstName ?? "").trim() || undefined,
      last_name: String(person.lastName ?? "").trim() || undefined,
      email: String(person.email ?? "").trim() || undefined,
    }
  }).filter((p) => p.first_name || p.last_name || p.email)

  const body: Record<string, unknown> = {
    type: "business",
    ...(legalName ? { business_legal_name: legalName } : {}),
    ...(hasAddress ? { address } : {}),
    ...(associatedPersons.length ? { associated_persons: associatedPersons } : {}),
  }
  if (!legalName && !hasAddress && associatedPersons.length === 0) return

  try {
    await bridgeFetch({
      method: "PUT",
      path: `/customers/${encodeURIComponent(customerId)}`,
      json: body,
      idempotencyKey: `bridge-prefill:${input.businessId}:${customerId}`,
    })
  } catch (error) {
    console.warn("[bridge] Grid packet prefill failed", error)
  }
}
