import { NextResponse } from "next/server"
import sgMail from "@sendgrid/mail"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

/**
 * Office-triggered transaction status email to end user (SendGrid optional).
 */
export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  let body: { type?: string; transactionId?: string; status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "SENDGRID_API_KEY not set — notification not sent",
    })
  }

  sgMail.setApiKey(apiKey)

  const admin = createSupabaseAdmin()
  const txId = body.transactionId
  if (!txId) {
    return NextResponse.json({ error: "transactionId required" }, { status: 400 })
  }

  let { data: tx } = await admin
    .from("transactions")
    .select("user_id, transaction_id, status")
    .eq("id", txId)
    .maybeSingle()
  if (!tx) {
    const second = await admin
      .from("transactions")
      .select("user_id, transaction_id, status")
      .eq("transaction_id", txId)
      .maybeSingle()
    tx = second.data
  }
  if (!tx?.user_id) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  const { data: user } = await admin.from("users").select("email, first_name").eq("id", tx.user_id).maybeSingle()
  const to = user?.email
  if (!to) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 })
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || "noreply@easner.com"
  const fromName = process.env.SENDGRID_FROM_NAME || "Easner"

  await sgMail.send({
    to,
    from: { email: fromEmail, name: fromName },
    subject: `Transaction ${body.status ?? tx.status ?? ""} — Easner`,
    text: `Your transaction ${tx.transaction_id ?? txId} status is now ${body.status ?? tx.status ?? "updated"}.`,
    html: `<p>Hi ${user?.first_name ?? ""},</p><p>Your transaction <strong>${tx.transaction_id ?? txId}</strong> is now <strong>${body.status ?? tx.status ?? "updated"}</strong>.</p>`,
  })

  return NextResponse.json({ success: true })
}
