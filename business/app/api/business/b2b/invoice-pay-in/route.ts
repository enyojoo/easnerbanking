import { NextResponse } from "next/server"
import { requireBusinessOrg } from "@/lib/b2b/resolve-org"
import { resolvePayInForBusiness } from "@/lib/invoices/resolve-pay-in-for-business"

/** Authenticated org members: real VA + wallet for invoice pay-in / PDF (parity with accounts). */
export async function GET(request: Request) {
  const ctx = await requireBusinessOrg(request)
  if (!ctx.ok) return ctx.response

  const url = new URL(request.url)
  const currency = (url.searchParams.get("currency") || "USD").trim().toUpperCase()
  if (!currency) {
    return NextResponse.json({ error: "currency is required" }, { status: 400 })
  }

  const payIn = await resolvePayInForBusiness(ctx.businessId, currency, {
    persistVirtualAccount: true,
  })

  return NextResponse.json(payIn)
}
