import type { SupabaseClient } from "@supabase/supabase-js"

export function defaultBusinessOrgName(email: string | undefined, fallbackId: string): string {
  const local = (email ?? "").split("@")[0]?.trim()
  if (local) return `${local} Business`
  return `Business ${fallbackId.slice(0, 8)}`
}

export function firstNameFromFullName(fullName: string | null | undefined): string | null {
  if (!fullName) return null
  const trimmed = fullName.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0] ?? null
}

export function possessiveBusinessOrgName(firstName: string): string {
  const clean = firstName.replace(/[^a-zA-Z0-9'-]/g, "").trim()
  const base = clean || "Owner"
  return `${base}'s Business`
}

export function resolveBusinessOrgName(
  email: string | undefined,
  userId: string,
  fullName: string | null | undefined,
): string {
  const first = firstNameFromFullName(fullName)
  return first ? possessiveBusinessOrgName(first) : defaultBusinessOrgName(email, userId)
}

async function readUserBusinessLink(
  admin: SupabaseClient,
  userId: string,
): Promise<{ easner_business_id: string | null; full_name: string | null } | null> {
  const { data } = await admin
    .from("users")
    .select("easner_business_id,full_name")
    .eq("id", userId)
    .maybeSingle()
  return data ?? null
}

async function tryDeleteOrphanBusiness(admin: SupabaseClient, businessId: string): Promise<void> {
  const { count, error } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("easner_business_id", businessId)
  if (error || (count ?? 0) > 0) return
  await admin.from("businesses").delete().eq("id", businessId)
}

async function insertBusinessRow(
  admin: SupabaseClient,
  orgName: string,
  country: string | null | undefined,
): Promise<string> {
  const withCountry = {
    name: orgName,
    easetag: null as string | null,
    ...(country ? { country } : {}),
  }

  const { data: insertedWithCountry, error: insertErrWithCountry } = await admin
    .from("businesses")
    .insert(withCountry)
    .select("id")
    .single()

  if (!insertErrWithCountry && insertedWithCountry?.id) {
    return insertedWithCountry.id
  }

  const { data: insertedNoCountry, error: insertErrNoCountry } = await admin
    .from("businesses")
    .insert({
      name: orgName,
      easetag: null as string | null,
    })
    .select("id")
    .single()

  if (insertErrNoCountry || !insertedNoCountry?.id) {
    throw new Error(insertErrNoCountry?.message ?? insertErrWithCountry?.message ?? "Failed to create organization")
  }

  return insertedNoCountry.id
}

async function backfillBusinessCountryIfEmpty(
  admin: SupabaseClient,
  businessId: string,
  country: string | null | undefined,
): Promise<void> {
  if (!country) return
  try {
    const { data: orgRow } = await admin.from("businesses").select("country").eq("id", businessId).maybeSingle()
    const cur = typeof orgRow?.country === "string" ? orgRow.country.trim() : ""
    if (!cur) {
      await admin.from("businesses").update({ country, updated_at: new Date().toISOString() }).eq("id", businessId)
    }
  } catch {
    // non-fatal
  }
}

export type EnsureBusinessOrganizationInput = {
  userId: string
  email?: string | null
  fullName?: string | null
  country?: string | null
}

/**
 * Idempotent business org provisioning.
 *
 * Bootstrap and profile GET used to race: both inserted into `businesses` when
 * `users.easner_business_id` was still null, producing duplicate "X's Business" rows.
 * Link only when the user row is still unlinked; delete orphan business if we lose the race.
 */
export async function ensureBusinessOrganizationId(
  admin: SupabaseClient,
  input: EnsureBusinessOrganizationInput,
): Promise<string> {
  const { userId, email, fullName, country } = input

  const initial = await readUserBusinessLink(admin, userId)
  if (initial?.easner_business_id) {
    await backfillBusinessCountryIfEmpty(admin, initial.easner_business_id, country)
    return initial.easner_business_id
  }

  const orgName = resolveBusinessOrgName(email ?? undefined, userId, fullName ?? initial?.full_name ?? null)
  const insertedBusinessId = await insertBusinessRow(admin, orgName, country)

  const linkPayload = {
    easner_business_id: insertedBusinessId,
    role: "business" as const,
    updated_at: new Date().toISOString(),
    ...(email != null ? { email } : {}),
    ...(fullName ? { full_name: fullName } : {}),
  }

  const { data: linked } = await admin
    .from("users")
    .update(linkPayload)
    .eq("id", userId)
    .is("easner_business_id", null)
    .select("easner_business_id")
    .maybeSingle()

  if (linked?.easner_business_id) {
    await backfillBusinessCountryIfEmpty(admin, linked.easner_business_id, country)
    return linked.easner_business_id
  }

  const winner = await readUserBusinessLink(admin, userId)
  if (winner?.easner_business_id) {
    await tryDeleteOrphanBusiness(admin, insertedBusinessId)
    await backfillBusinessCountryIfEmpty(admin, winner.easner_business_id, country)
    return winner.easner_business_id
  }

  const { error: upsertErr } = await admin.from("users").upsert(
    {
      id: userId,
      email: email ?? null,
      full_name: fullName ?? initial?.full_name ?? null,
      easner_business_id: insertedBusinessId,
      role: "business",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  )
  if (upsertErr) {
    throw new Error(upsertErr.message)
  }

  await backfillBusinessCountryIfEmpty(admin, insertedBusinessId, country)
  return insertedBusinessId
}
