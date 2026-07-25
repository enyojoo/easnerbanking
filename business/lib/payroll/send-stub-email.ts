import sgMail from "@sendgrid/mail"
import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import { generatePayrollStubPdfBuffer } from "@/lib/payroll/generate-payroll-stub-pdf"
import { railLabel } from "@/lib/payroll/helpers"
import type { PayrollLineRow, PayrollRunRow } from "@/lib/payroll/map-payroll"
import type { PayrollRail } from "@/lib/payroll/types"
import { formatCurrency } from "@/lib/utils"

let apiKeyInitialized = false

function ensureSendGrid() {
  if (!apiKeyInitialized) {
    const key = process.env.SENDGRID_API_KEY
    if (!key) throw new Error("SENDGRID_API_KEY required")
    sgMail.setApiKey(key)
    apiKeyInitialized = true
  }
}

export async function sendPayrollStubForLine(
  admin: SupabaseClient,
  businessId: string,
  runId: string,
  lineId: string,
): Promise<void> {
  const { data: biz } = await admin.from("businesses").select("name").eq("id", businessId).maybeSingle()
  const businessName = String(biz?.name || "Easner Business")

  const { data: runRow } = await admin.from("payroll_runs").select("*").eq("id", runId).maybeSingle()
  const { data: lineRow } = await admin
    .from("payroll_lines")
    .select("*")
    .eq("id", lineId)
    .eq("run_id", runId)
    .maybeSingle()

  if (!runRow || !lineRow || lineRow.status !== "paid") return

  const snap = (lineRow.recipient_snapshot as Record<string, unknown>) ?? {}
  const email = typeof snap.email === "string" ? snap.email.trim() : ""
  if (!email) return

  const amount =
    (typeof lineRow.amount_cents === "string"
      ? Number(lineRow.amount_cents)
      : Number(lineRow.amount_cents ?? 0)) / 100
  const currency = String(lineRow.pay_currency || "USD").toUpperCase()
  const rail = railLabel(String(lineRow.rail) as PayrollRail)

  const pdf = await generatePayrollStubPdfBuffer({
    businessName,
    payeeName: String(snap.fullName || "Payee"),
    payeeEmail: email,
    personType: snap.type === "contractor" ? "contractor" : "employee",
    payPeriod: String((runRow as PayrollRunRow).scheduled_for || runRow.created_at).slice(0, 10),
    paidAt: new Date().toISOString().slice(0, 10),
    amount: formatCurrency(amount, currency),
    currency,
    rail,
    transferEtid: lineRow.transfer_etid,
  })

  ensureSendGrid()
  await sgMail.send({
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL || "noreply@easner.com",
    subject: `You've been paid — ${businessName}`,
    text: `You've received ${formatCurrency(amount, currency)} from ${businessName}.`,
    html: `<p>You've received <strong>${formatCurrency(amount, currency)}</strong> from ${businessName}.</p>`,
    attachments: [
      {
        content: pdf.toString("base64"),
        filename: `pay-stub-${lineId.slice(0, 8)}.pdf`,
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  })

  await admin
    .from("payroll_lines")
    .update({
      stub_storage_path: `email:${email}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lineId)
}

export async function sendPayrollStubEmailsForRun(
  admin: SupabaseClient,
  businessId: string,
  runId: string,
): Promise<void> {
  const { data: lines } = await admin
    .from("payroll_lines")
    .select("id")
    .eq("run_id", runId)
    .eq("status", "paid")

  for (const line of lines ?? []) {
    await sendPayrollStubForLine(admin, businessId, runId, String(line.id)).catch(() => undefined)
  }
}

export async function sendPayrollEasetagInviteEmail(input: {
  to: string
  recipientName: string
  businessName: string
  signupUrl: string
}) {
  await emailService.sendEmail({
    to: input.to,
    template: "payrollEasetagInvite",
    audience: "personal",
    data: {
      recipientName: input.recipientName,
      businessName: input.businessName,
      signupUrl: input.signupUrl,
    },
  })
}
