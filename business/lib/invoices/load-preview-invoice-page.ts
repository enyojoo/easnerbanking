import type { PublicInvoicePayload } from "@/lib/invoices/json-public-invoice-from-row"
import { serverApiFetch } from "@/lib/server/api"

export type PreviewInvoicePageResult =
  | { status: "unauthorized" }
  | { status: "not_found" }
  | { status: "ok"; payload: PublicInvoicePayload }

/** Server load for `/invoice/preview/[id]` — payload comes from the API. */
export async function loadPreviewInvoicePage(invoiceId: string): Promise<PreviewInvoicePageResult> {
  const id = invoiceId.trim()
  if (!id) return { status: "not_found" }

  try {
    const payload = await serverApiFetch<PublicInvoicePayload>(
      `/api/invoices/preview/${encodeURIComponent(id)}`,
    )
    return { status: "ok", payload }
  } catch (err) {
    const status = /failed with (\d+)/.exec(err instanceof Error ? err.message : "")?.[1]
    if (status === "401" || status === "403") return { status: "unauthorized" }
    return { status: "not_found" }
  }
}
