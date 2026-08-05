import type { SupabaseClient } from "@supabase/supabase-js"
import { parseInvoiceMetadata } from "@/lib/b2b/invoice-metadata"

/** Persist Stripe ledger transaction id on invoice paymentInfo for instant dashboard links. */
export async function patchInvoiceStripeLedgerTransactionId(
  admin: SupabaseClient,
  input: {
    invoiceId: string
    businessId: string
    ledgerTransactionId: string
  },
): Promise<void> {
  const ledgerTransactionId = input.ledgerTransactionId.trim()
  if (!ledgerTransactionId) return

  const { data: row, error: fetchErr } = await admin
    .from("invoices")
    .select("metadata")
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (fetchErr || !row) {
    if (fetchErr) {
      console.error("[stripe] patch invoice ledger link:", fetchErr.message)
    }
    return
  }

  const meta = parseInvoiceMetadata(row.metadata)
  if (meta.paymentInfo?.method !== "stripe") return
  if (meta.paymentInfo.transactionId?.trim()) return

  const { error: updateErr } = await admin
    .from("invoices")
    .update({
      metadata: {
        ...meta,
        paymentInfo: {
          ...meta.paymentInfo,
          transactionId: ledgerTransactionId,
        },
      },
    })
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)

  if (updateErr) {
    console.error("[stripe] patch invoice ledger link:", updateErr.message)
  }
}
