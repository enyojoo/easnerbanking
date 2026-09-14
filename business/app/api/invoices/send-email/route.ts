import { NextRequest, NextResponse } from "next/server"
import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { generateInvoicePdfBuffer } from "@/lib/generate-invoice-pdf"
import { fetchInvoiceIssuerForBusiness, resolveInvoiceReplyEmail } from "@/lib/invoices/issuer"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { parseBusinessInvoiceSettings } from "@/lib/invoices/invoice-settings"
import { resolvePaymentDisplay } from "@/lib/invoices/resolve-payment-display"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import {
  buildInvoicePdfPaymentSection,
  paymentFlagsFromDisplay,
} from "@/lib/invoices/invoice-payment-copy"
import { sendInvoiceEmail } from "@/lib/invoice-email-service"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { buildInvoiceCustomerUrl } from "@/lib/invoice-public-url"
import { assessInvoiceBusinessReadinessFromIssuer } from "@/lib/invoices/invoice-business-readiness"
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

    if (invoice.status === "draft") {
      return NextResponse.json(
        { error: "Issue this invoice before emailing" },
        { status: 400 },
      )
    }

    if (!invoice.customerEmail?.trim()) {
      return NextResponse.json(
        { error: "Invoice has no customer email" },
        { status: 400 },
      )
    }

    const { data: biz } = await admin
      .from("businesses")
      .select("verification_status, invoice_settings, bridge_kyc_status")
      .eq("id", ctx.businessId)
      .maybeSingle()

    const tier1Complete = isBusinessTier1Complete(biz)

    const canProvision = canProvisionInvoiceDepositInstructions(
      invoice.currency,
      tier1Complete,
      TIER2_COMPLETE_PLACEHOLDER,
    )

    const rawPayIn = canProvision
      ? await resolvePayInForBusiness(ctx.businessId, invoice.currency, {
          persistVirtualAccount: true,
        })
      : {}

    const invoiceSettings = parseBusinessInvoiceSettings(biz?.invoice_settings)
    const paymentDisplay = resolvePaymentDisplay({
      invoice,
      businessDefaults: invoiceSettings,
      payIn: rawPayIn,
      payable: true,
      stripeOnlineEnabled: isStripeInvoicePaymentsEnabled(),
    })
    const paymentFlags = paymentFlagsFromDisplay(paymentDisplay)

    const issuer = await fetchInvoiceIssuerForBusiness(admin, ctx.businessId)
    const businessReplyEmail = await resolveInvoiceReplyEmail(
      admin,
      ctx.businessId,
      ctx.userId,
    )
    const readiness = assessInvoiceBusinessReadinessFromIssuer(issuer, businessReplyEmail)
    if (!readiness.ready) {
      return NextResponse.json({ error: readiness.message }, { status: 400 })
    }
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

    const { data: bizRow } = await admin
      .from("businesses")
      .select("easetag")
      .eq("id", ctx.businessId)
      .maybeSingle()
    const easetag =
      typeof bizRow?.easetag === "string" && bizRow.easetag.trim() ? bizRow.easetag.trim() : null
    const invoiceViewUrl = buildInvoiceCustomerUrl(easetag, invoice)

    const pdfBuffer = await generateInvoicePdfBuffer(
      invoice,
      issuerForCustomer,
      buildInvoicePdfPaymentSection({
        easetag,
        invoice,
        flags: paymentFlags,
        includeOnPdf: paymentDisplay.includePaymentOnPdf,
      }),
    )

    const result = await sendInvoiceEmail(invoice, invoiceViewUrl, pdfBuffer, {
      businessName: issuer.name,
      businessReplyEmail,
      issuer: { ...issuer, email: businessReplyEmail },
      includePaymentContext: paymentDisplay.includePaymentInEmail,
      paymentMethods: paymentFlags,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 500 },
      )
    }

    const now = new Date().toISOString()
    const emailsSent = [
      ...(invoice.emailsSent ?? []),
      { sentAt: now, to: invoice.customerEmail },
    ]
    const prevMeta =
      typeof b2b.metadata === "object" && b2b.metadata && !Array.isArray(b2b.metadata)
        ? (b2b.metadata as Record<string, unknown>)
        : {}
    const markSent = invoice.status === "unpaid"
    const nextHistory = markSent
      ? [...(invoice.statusHistory ?? []), { status: "sent", timestamp: now }]
      : invoice.statusHistory
    await admin
      .from("invoices")
      .update({
        ...(markSent ? { status: "sent" } : {}),
        metadata: {
          ...prevMeta,
          emailsSent,
          ...(nextHistory ? { statusHistory: nextHistory } : {}),
        },
        updated_at: now,
      })
      .eq("id", invoiceId)

    return NextResponse.json({
      success: true,
      message: `Invoice sent to ${invoice.customerEmail}`,
      emailsSent,
      status: markSent ? "sent" : invoice.status,
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
