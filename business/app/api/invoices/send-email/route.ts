import { NextRequest, NextResponse } from "next/server"
import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { generateInvoicePdfBuffer } from "@/lib/generate-invoice-pdf"
import { fetchInvoiceIssuerForBusiness, resolveInvoiceReplyEmail } from "@/lib/invoices/issuer"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"
import { sendInvoiceEmail } from "@/lib/invoice-email-service"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { invoicePublicViewPath } from "@/lib/invoice-public-url"
import {
  canProvisionInvoiceDepositInstructions,
  TIER2_COMPLETE_PLACEHOLDER,
} from "@/lib/compliance-placeholders"

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireBusinessOrg(request)
    if (!ctx.ok) return ctx.response

    const body = await request.json().catch(() => ({})) as {
      invoiceId?: string
      invoice?: { id?: string }
    }
    const invoiceId =
      (typeof body.invoiceId === "string" && body.invoiceId.trim()) ||
      (typeof body.invoice?.id === "string" && body.invoice.id.trim()) ||
      ""

    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 })
    }

    const admin = createSupabaseAdmin()
    const { data: row, error } = await admin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const b2b = row as B2bInvoiceRow
    if (b2b.business_id !== ctx.businessId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const invoice = mapRowToInvoice(b2b)

    if (!invoice.customerEmail?.trim()) {
      return NextResponse.json(
        { error: "Invoice has no customer email" },
        { status: 400 },
      )
    }

    const { data: biz } = await admin
      .from("businesses")
      .select("noah_kyb_status")
      .eq("id", ctx.businessId)
      .maybeSingle()

    const tier1Complete =
      (biz?.noah_kyb_status as string | null | undefined) === "approved"

    const canProvision = canProvisionInvoiceDepositInstructions(
      invoice.currency,
      tier1Complete,
      TIER2_COMPLETE_PLACEHOLDER,
    )

    const payIn = canProvision
      ? await resolvePayInForBusiness(ctx.businessId, invoice.currency, {
          persistVirtualAccount: true,
        })
      : {}

    const issuer = await fetchInvoiceIssuerForBusiness(admin, ctx.businessId)
    const businessReplyEmail = await resolveInvoiceReplyEmail(
      admin,
      ctx.businessId,
      ctx.userId,
    )
    if (!businessReplyEmail) {
      return NextResponse.json(
        {
          error:
            "Add a support email in Settings → Business before sending invoices, so customers can reply to you.",
        },
        { status: 400 },
      )
    }

    const issuerForCustomer = { ...issuer, email: businessReplyEmail }

    const pdfBuffer = await generateInvoicePdfBuffer(
      invoice,
      canProvision ? payIn.bankAccount : undefined,
      canProvision ? payIn.stablecoinAccount : undefined,
      issuerForCustomer,
    )

    const origin =
      request.headers.get("origin") ||
      request.headers.get("x-forwarded-host") ||
      "http://localhost:3000"
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`
    const { data: bizRow } = await admin
      .from("businesses")
      .select("easetag")
      .eq("id", ctx.businessId)
      .maybeSingle()
    const easetag =
      typeof bizRow?.easetag === "string" && bizRow.easetag.trim() ? bizRow.easetag.trim() : null
    const invoiceViewUrl = easetag
      ? `${baseUrl}${invoicePublicViewPath(easetag, invoice.invoiceNumber)}`
      : `${baseUrl}/invoice-view/${invoice.id}`

    const result = await sendInvoiceEmail(invoice, invoiceViewUrl, pdfBuffer, {
      businessName: issuer.name,
      businessReplyEmail,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: `Invoice sent to ${invoice.customerEmail}`,
    })
  } catch (err) {
    console.error("Send invoice email error:", err)
    return NextResponse.json(
      {
        error: "Failed to send invoice email",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
