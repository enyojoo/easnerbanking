import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import {
  noahCustomerIdFromBusinessId,
  noahCustomerIdFromUserId,
  parseEasnerNoahCustomerId,
} from "@/lib/noah/customer-id"

export type ReprovisionSubject = {
  scope: "individual" | "business"
  subjectUserId: string
  subjectBusinessId: string | null
  noahCustomerId: string
}

export async function resolveReprovisionSubject(
  admin: SupabaseClient,
  input: {
    userId?: string | null
    businessId?: string | null
    noahCustomerId?: string | null
  },
): Promise<ReprovisionSubject | { error: string }> {
  const businessId = String(input.businessId ?? "").trim()
  const userId = String(input.userId ?? "").trim()
  const noahCustomerIdInput = String(input.noahCustomerId ?? "").trim()

  if (businessId) {
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, businessId)
    if (!ownerUserId) return { error: "business_owner_not_found" }
    const { data: biz } = await admin
      .from("businesses")
      .select("noah_customer_id")
      .eq("id", businessId)
      .maybeSingle()
    const stored = (biz?.noah_customer_id as string | null | undefined)?.trim() || null
    return {
      scope: "business",
      subjectUserId: ownerUserId,
      subjectBusinessId: businessId,
      noahCustomerId: stored || noahCustomerIdInput || noahCustomerIdFromBusinessId(businessId),
    }
  }

  if (userId) {
    const { data: user } = await admin
      .from("users")
      .select("noah_customer_id")
      .eq("id", userId)
      .maybeSingle()
    const stored = (user?.noah_customer_id as string | null | undefined)?.trim() || null
    return {
      scope: "individual",
      subjectUserId: userId,
      subjectBusinessId: null,
      noahCustomerId: stored || noahCustomerIdInput || noahCustomerIdFromUserId(userId),
    }
  }

  if (!noahCustomerIdInput) {
    return { error: "user_id_business_id_or_noah_customer_id_required" }
  }

  const parsed = parseEasnerNoahCustomerId(noahCustomerIdInput)
  if (parsed?.kind === "business") {
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, parsed.businessId)
    if (!ownerUserId) return { error: "business_owner_not_found" }
    return {
      scope: "business",
      subjectUserId: ownerUserId,
      subjectBusinessId: parsed.businessId,
      noahCustomerId: noahCustomerIdInput,
    }
  }
  if (parsed?.kind === "individual") {
    return {
      scope: "individual",
      subjectUserId: parsed.userId,
      subjectBusinessId: null,
      noahCustomerId: noahCustomerIdInput,
    }
  }

  const { data: bizByStored } = await admin
    .from("businesses")
    .select("id, noah_customer_id")
    .eq("noah_customer_id", noahCustomerIdInput)
    .maybeSingle()
  if (bizByStored?.id) {
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, String(bizByStored.id))
    if (!ownerUserId) return { error: "business_owner_not_found" }
    return {
      scope: "business",
      subjectUserId: ownerUserId,
      subjectBusinessId: String(bizByStored.id),
      noahCustomerId: noahCustomerIdInput,
    }
  }

  const { data: userByStored } = await admin
    .from("users")
    .select("id")
    .eq("noah_customer_id", noahCustomerIdInput)
    .maybeSingle()
  if (userByStored?.id) {
    return {
      scope: "individual",
      subjectUserId: String(userByStored.id),
      subjectBusinessId: null,
      noahCustomerId: noahCustomerIdInput,
    }
  }

  return { error: "could_not_resolve_subject_for_noah_customer_id" }
}
