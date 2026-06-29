import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { mapRowToInvoice, type B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import crypto from "crypto"

function verifyToken(token: string, easetag: string): string | null {
  const secret = process.env.INVOICE_PORTAL_SECRET?.trim() || process.env.EASNER_INTERNAL_CRON_SECRET?.trim()
  if (!secret) return null
  try {
    const [payloadB64, sig] = token.split(".")
    if (!payloadB64 || !sig) return null
    const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex")
    if (sig !== expected) return null
    const json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      easetag?: string
      email?: string
      exp?: number
    }
    if (json.easetag !== easetag) return null
    if (json.exp && Date.now() > json.exp) return null
    return json.email?.trim().toLowerCase() ?? null
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ easetag: string }> },
) {
  const { easetag } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get("token")?.trim()
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 })
  }

  const email = verifyToken(token, easetag)
  if (!email) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("easetag", easetag)
    .maybeSingle()

  if (!biz?.id) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 })
  }

  const { data: rows, error } = await admin
    .from("invoices")
    .select("*")
    .eq("business_id", biz.id)
    .ilike("customer_email", email)
    .in("status", ["open", "sent", "past_due"])
    .order("due_date", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const invoices = ((rows ?? []) as B2bInvoiceRow[]).map(mapRowToInvoice)
  return NextResponse.json({ invoices })
}
