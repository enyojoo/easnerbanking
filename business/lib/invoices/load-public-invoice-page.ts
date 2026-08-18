import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { normalizeEasetag } from "@/lib/easetag-validation"
import {
  jsonPublicInvoiceFromRow,
  type PublicInvoicePayload,
} from "@/lib/invoices/json-public-invoice-from-row"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Server load for the public invoice HTML document — includes checkout when payable. */
export async function loadPublicInvoicePage(parts: string[]): Promise<PublicInvoicePayload | null> {
  const segments = parts.map((part) => part.trim()).filter(Boolean)
  if (segments.length !== 1 && segments.length !== 2) return null

  const admin = createSupabaseAdmin()
  let row: B2bInvoiceRow | null = null

  if (segments.length === 1) {
    const { data } = await admin.from("invoices").select("*").eq("id", segments[0]).maybeSingle()
    row = (data as B2bInvoiceRow | null) ?? null
  } else {
    const cleanTag = normalizeEasetag(segments[0])
    const decodedNumber = decodeURIComponent(segments[1]).trim().toLowerCase()
    if (!cleanTag || !decodedNumber) return null
    const { data: biz } = await admin.from("businesses").select("id").eq("easetag", cleanTag).maybeSingle()
    if (!biz?.id) return null
    const { data } = await admin
      .from("invoices")
      .select("*")
      .eq("business_id", biz.id as string)
      .ilike("invoice_number", decodedNumber)
      .maybeSingle()
    row = (data as B2bInvoiceRow | null) ?? null
  }

  if (!row) return null
  return jsonPublicInvoiceFromRow(admin, row, { includeCheckout: true })
}
