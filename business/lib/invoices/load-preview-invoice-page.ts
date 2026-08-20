import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { BUSINESS_APP_SESSION_COOKIE, getBusinessAppSessionUser } from "@/lib/app-session"
import {
  jsonPublicInvoiceFromRow,
  type PublicInvoicePayload,
} from "@/lib/invoices/json-public-invoice-from-row"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { cookies } from "next/headers"

export type PreviewInvoicePageResult =
  | { status: "unauthorized" }
  | { status: "not_found" }
  | { status: "ok"; payload: PublicInvoicePayload }

/** Server load for `/invoice/preview/[id]` – same document as the customer view. */
export async function loadPreviewInvoicePage(invoiceId: string): Promise<PreviewInvoicePageResult> {
  const id = invoiceId.trim()
  if (!id) return { status: "not_found" }

  const store = await cookies()
  const token = store.get(BUSINESS_APP_SESSION_COOKIE)?.value
  const sessionUser = token ? getBusinessAppSessionUser(token) : null
  if (!sessionUser?.id) return { status: "unauthorized" }

  const admin = createSupabaseAdmin()
  const { data: userRow } = await admin
    .from("users")
    .select("easner_business_id")
    .eq("id", sessionUser.id)
    .maybeSingle()
  const businessId =
    typeof userRow?.easner_business_id === "string" && userRow.easner_business_id.trim()
      ? userRow.easner_business_id.trim()
      : null
  if (!businessId) return { status: "unauthorized" }

  const { data } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle()
  if (!data) return { status: "not_found" }

  const payload = await jsonPublicInvoiceFromRow(admin, data as B2bInvoiceRow, { allowDraft: true })
  if (!payload) return { status: "not_found" }
  return { status: "ok", payload }
}
