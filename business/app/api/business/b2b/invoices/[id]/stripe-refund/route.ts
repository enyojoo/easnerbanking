import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { refundInvoiceStripePayment } from "@/lib/stripe/refund-invoice-payment"

/** Full refund of a Stripe-collected invoice payment (platform account). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: "Invoice id required" }, { status: 400 })
  }

  const result = await refundInvoiceStripePayment({
    businessId: ctx.businessId,
    invoiceId: id,
    actorUserId: ctx.userId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    refundId: result.refundId,
    status: result.status,
    invoiceStatus: result.invoiceStatus,
    ledgerTransactionId: result.ledgerTransactionId,
  })
}
