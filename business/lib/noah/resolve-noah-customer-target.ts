import type { SupabaseClient } from "@supabase/supabase-js"
import {
  compactUuidForNoahCustomerId,
  parseEasnerNoahCustomerId,
  type ParsedEasnerNoahCustomer,
} from "./customer-id"

function compactUuidToUuid(hex32: string): string | null {
  if (!/^[0-9a-fA-F]{32}$/.test(hex32)) return null
  const h = hex32.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/**
 * Map a Noah `CustomerID` (and optional webhook `Data`) to an Easner user or business.
 * Used when IDs are not `eind_*` / `ebiz_*` shaped or Noah returns a stored id we already mirrored.
 */
export async function resolveNoahCustomerTarget(
  admin: SupabaseClient,
  opts: {
    customerId: string
    webhookData?: Record<string, unknown>
  },
): Promise<ParsedEasnerNoahCustomer | null> {
  const customerId = opts.customerId.trim()
  if (!customerId) return null

  const parsed = parseEasnerNoahCustomerId(customerId)
  if (parsed) return parsed

  const { data: bizByNoahId } = await admin
    .from("businesses")
    .select("id")
    .eq("noah_customer_id", customerId)
    .maybeSingle()
  if (bizByNoahId?.id) {
    return { kind: "business", businessId: String(bizByNoahId.id) }
  }

  const { data: userByNoahId } = await admin
    .from("users")
    .select("id")
    .eq("noah_customer_id", customerId)
    .maybeSingle()
  if (userByNoahId?.id) {
    return { kind: "individual", userId: String(userByNoahId.id) }
  }

  const asUuid = compactUuidToUuid(customerId)
  if (asUuid) {
    const { data: bizById } = await admin.from("businesses").select("id").eq("id", asUuid).maybeSingle()
    if (bizById?.id) return { kind: "business", businessId: asUuid }

    const { data: userById } = await admin.from("users").select("id").eq("id", asUuid).maybeSingle()
    if (userById?.id) return { kind: "individual", userId: asUuid }
  }

  const webhookData = opts.webhookData
  if (webhookData) {
    const meta = webhookData.Metadata as Record<string, unknown> | undefined
    const easnerUserId =
      meta?.easner_user_id != null ? String(meta.easner_user_id).trim() : ""
    const product = meta?.easner_product != null ? String(meta.easner_product).trim() : ""
    if (easnerUserId) {
      if (product === "easner_business") {
        const { data: owner } = await admin
          .from("users")
          .select("easner_business_id")
          .eq("id", easnerUserId)
          .maybeSingle()
        const businessId = owner?.easner_business_id as string | null | undefined
        if (businessId) return { kind: "business", businessId: String(businessId) }
      }
      return { kind: "individual", userId: easnerUserId }
    }

    const easnerBusinessId =
      meta?.easner_business_id != null ? String(meta.easner_business_id).trim() : ""
    if (easnerBusinessId) {
      return { kind: "business", businessId: easnerBusinessId }
    }
  }

  const compactFromEbiz = customerId.startsWith("ebiz_")
    ? compactUuidToUuid(customerId.slice("ebiz_".length))
    : null
  if (compactFromEbiz) {
    const { data: biz } = await admin.from("businesses").select("id").eq("id", compactFromEbiz).maybeSingle()
    if (biz?.id) return { kind: "business", businessId: compactFromEbiz }
  }

  const compactFromEind = customerId.startsWith("eind_")
    ? compactUuidToUuid(customerId.slice("eind_".length))
    : null
  if (compactFromEind) {
    const { data: user } = await admin.from("users").select("id").eq("id", compactFromEind).maybeSingle()
    if (user?.id) return { kind: "individual", userId: compactFromEind }
  }

  return null
}

/** Re-export for callers that only need compact UUID → UUID without DB. */
export { compactUuidForNoahCustomerId }
