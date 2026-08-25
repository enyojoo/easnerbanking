import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export type CollectionPayment = {
  /** Settlement id – the handle for refunds. */
  settlementId: string
  settlementTable: "invoice_stripe_settlements" | "checkout_stripe_settlements"
  source: "invoice" | "payment_link" | "embed"
  description: string
  grossCents: number
  feeCents: number
  netCents: number
  taxCents: number | null
  currency: string
  phase: string
  paidAt: string
  customerEmail: string | null
  invoiceId: string | null
  invoiceNumber: string | null
  paymentLinkId: string | null
}

/**
 * One payments list across every Collections surface – invoice Pay online,
 * Payment Links, and the website embed – regardless of which settlement table
 * the payment landed in.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const url = new URL(request.url)
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") ?? 100)))

  const admin = createSupabaseAdmin()
  const [checkoutResult, invoiceResult] = await Promise.all([
    admin
      .from("checkout_stripe_settlements")
      .select("id, source, payment_link_id, checkout_session_id, gross_cents, fee_cents, net_cents, currency, phase, created_at")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("invoice_stripe_settlements")
      .select("id, invoice_id, gross_cents, fee_cents, net_cents, currency, phase, created_at")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ])

  const checkoutRows = checkoutResult.data ?? []
  const invoiceRows = invoiceResult.data ?? []

  // Enrich: link labels, session emails, invoice numbers + bill-to emails.
  const linkIds = [...new Set(checkoutRows.map((r) => r.payment_link_id).filter(Boolean).map(String))]
  const sessionIds = [
    ...new Set(checkoutRows.map((r) => r.checkout_session_id).filter(Boolean).map(String)),
  ]
  const invoiceIds = [...new Set(invoiceRows.map((r) => r.invoice_id).filter(Boolean).map(String))]

  const [linksResult, sessionsResult, invoicesResult] = await Promise.all([
    linkIds.length
      ? admin.from("payment_links").select("id, label").in("id", linkIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    sessionIds.length
      ? admin
          .from("online_checkout_sessions")
          .select("id, customer_email")
          .in("id", sessionIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    invoiceIds.length
      ? admin
          .from("invoices")
          .select("id, invoice_number, customer_email")
          .in("id", invoiceIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])

  const linkLabels = new Map<string, string>()
  for (const row of linksResult.data ?? []) {
    linkLabels.set(String(row.id), String(row.label ?? ""))
  }
  const sessionEmails = new Map<string, string | null>()
  for (const row of sessionsResult.data ?? []) {
    const email = (row as Record<string, unknown>).customer_email
    sessionEmails.set(String((row as Record<string, unknown>).id), email ? String(email) : null)
  }
  const invoiceInfo = new Map<string, { number: string | null; email: string | null }>()
  for (const row of invoicesResult.data ?? []) {
    const record = row as Record<string, unknown>
    invoiceInfo.set(String(record.id), {
      number: record.invoice_number ? String(record.invoice_number) : null,
      email: record.customer_email ? String(record.customer_email) : null,
    })
  }

  const payments: CollectionPayment[] = [
    ...checkoutRows.map((row): CollectionPayment => {
      const record = row as Record<string, unknown>
      const source = record.source === "payment_link" ? "payment_link" : "embed"
      const linkLabel = record.payment_link_id
        ? linkLabels.get(String(record.payment_link_id)) ?? null
        : null
      return {
        settlementId: String(record.id),
        settlementTable: "checkout_stripe_settlements",
        source,
        description:
          source === "payment_link" ? linkLabel || "Payment link" : "Website checkout",
        grossCents: Number(record.gross_cents ?? 0),
        feeCents: Number(record.fee_cents ?? 0),
        netCents: Number(record.net_cents ?? 0),
        taxCents: record.tax_cents != null ? Number(record.tax_cents) : null,
        currency: String(record.currency ?? "USD"),
        phase: String(record.phase ?? "payment_received"),
        paidAt: String(record.created_at ?? ""),
        customerEmail: record.checkout_session_id
          ? sessionEmails.get(String(record.checkout_session_id)) ?? null
          : null,
        invoiceId: null,
        invoiceNumber: null,
        paymentLinkId: record.payment_link_id ? String(record.payment_link_id) : null,
      }
    }),
    ...invoiceRows.map((row): CollectionPayment => {
      const record = row as Record<string, unknown>
      const info = record.invoice_id ? invoiceInfo.get(String(record.invoice_id)) : undefined
      return {
        settlementId: String(record.id),
        settlementTable: "invoice_stripe_settlements",
        source: "invoice",
        description: info?.number ? `Invoice ${info.number}` : "Invoice payment",
        grossCents: Number(record.gross_cents ?? 0),
        feeCents: Number(record.fee_cents ?? 0),
        netCents: Number(record.net_cents ?? 0),
        taxCents: null,
        currency: String(record.currency ?? "USD"),
        phase: String(record.phase ?? "payment_received"),
        paidAt: String(record.created_at ?? ""),
        customerEmail: info?.email ?? null,
        invoiceId: record.invoice_id ? String(record.invoice_id) : null,
        invoiceNumber: info?.number ?? null,
        paymentLinkId: null,
      }
    }),
  ].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))

  return NextResponse.json({ payments: payments.slice(0, limit) })
}
