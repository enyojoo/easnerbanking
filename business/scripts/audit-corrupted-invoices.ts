#!/usr/bin/env npx tsx
/**
 * Flags invoices likely corrupted by partial PATCH (empty customer or zero amount on non-draft).
 * Run: npx tsx business/scripts/audit-corrupted-invoices.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"

async function main() {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("invoices")
    .select("id, invoice_number, business_id, status, customer_name, customer_email, amount_cents, created_at")
    .neq("status", "draft")

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const suspicious = (data ?? []).filter((row) => {
    const name = String(row.customer_name ?? "").trim()
    const email = String(row.customer_email ?? "").trim()
    const cents = Number(row.amount_cents ?? 0)
    return !name || !email || cents === 0
  })

  if (suspicious.length === 0) {
    console.log("No suspicious non-draft invoices found.")
    return
  }

  console.log(`Found ${suspicious.length} suspicious invoice(s):\n`)
  for (const row of suspicious) {
    console.log(
      `- ${row.invoice_number} (${row.id}) status=${row.status} customer="${row.customer_name}" amount_cents=${row.amount_cents}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
