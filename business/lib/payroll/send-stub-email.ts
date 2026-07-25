import sgMail from "@sendgrid/mail"
import type { SupabaseClient } from "@supabase/supabase-js"
import { emailService } from "@easner/server"
import { createHash } from "node:crypto"
import { generatePayrollStubPdfBuffer } from "@/lib/payroll/generate-payroll-stub-pdf"
import { railLabel } from "@/lib/payroll/helpers"
import {
  resolvePayStubFilename,
  resolvePayStubStoragePath,
} from "@/lib/payroll/pay-stub-filename"
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
  options: {
    forceEmail?: boolean
    deliveryId?: string
    deliveryAttempts?: number
    documentType?: "pay_stub" | "payment_reversal"
    reversalTransactionId?: string
    reversalOccurredAt?: string
  } = {},
): Promise<void> {
  const { data: biz } = await admin.from("businesses").select("name,logo_url").eq("id", businessId).maybeSingle()
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

  const amount =
    (typeof lineRow.amount_cents === "string"
      ? Number(lineRow.amount_cents)
      : Number(lineRow.amount_cents ?? 0)) / 100
  const currency = String(lineRow.pay_currency || "USD").toUpperCase()
  const rail = railLabel(String(lineRow.rail) as PayrollRail)

  const runMeta = ((runRow as PayrollRunRow).metadata as Record<string, unknown>) ?? {}
  const lineMeta = (lineRow.metadata as Record<string, unknown>) ?? {}
  const settledAt = String(lineRow.settled_at || lineRow.updated_at || new Date().toISOString())
  const documentOccurredAt = options.reversalOccurredAt || settledAt
  const settledAtDisplay = `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(documentOccurredAt))} UTC`
  const documentType = options.documentType ?? "pay_stub"
  const isReversal = documentType === "payment_reversal"
  const documentReference = `${isReversal ? "PR" : "PS"}-${String(lineRow.id).slice(0, 8).toUpperCase()}`
  const { data: connection } = lineRow.person_id
    ? await admin.from("payroll_connections")
        .select("user_id,status")
        .eq("person_id", lineRow.person_id)
        .maybeSingle()
    : { data: null }
  const filename = resolvePayStubFilename({
    easetag: connection?.user_id && typeof snap.easetag === "string" ? snap.easetag : null,
    fullName: typeof snap.fullName === "string" ? snap.fullName : null,
    reversal: isReversal,
  })
  const storagePath = resolvePayStubStoragePath({ businessId, runId, lineId, filename })

  const existing = await admin
    .from("payroll_documents")
    .select("*")
    .eq("line_id", lineId)
    .eq("type", documentType)
    .maybeSingle()

  let pdf: Buffer
  let documentId = existing.data?.id ? String(existing.data.id) : ""
  if (existing.data?.storage_path) {
    const downloaded = await admin.storage
      .from("payroll-documents")
      .download(String(existing.data.storage_path))
    if (downloaded.error || !downloaded.data) throw downloaded.error || new Error("Pay stub unavailable")
    pdf = Buffer.from(await downloaded.data.arrayBuffer())
  } else {
    pdf = await generatePayrollStubPdfBuffer({
    documentKind: documentType,
    businessName,
    businessLogoUrl: typeof biz?.logo_url === "string" ? biz.logo_url : null,
    payeeName: String(snap.fullName || "Payee"),
    payeeEmail: email || null,
    payeeEasetag: typeof snap.easetag === "string" ? snap.easetag : null,
    residenceCountry: typeof snap.country === "string" ? snap.country : null,
    personType: snap.type === "contractor" ? "contractor" : "employee",
    payPeriodStart: runRow.pay_period_start ? String(runRow.pay_period_start) : null,
    payPeriodEnd: runRow.pay_period_end ? String(runRow.pay_period_end) : null,
    payday: runRow.payday
      ? String(runRow.payday)
      : String((runRow as PayrollRunRow).scheduled_for || runRow.created_at).slice(0, 10),
    paidAt: settledAtDisplay,
    amount: formatCurrency(amount, currency),
    currency,
    rail,
    maskedDestination:
      typeof lineMeta.maskedDestination === "string" ? lineMeta.maskedDestination : null,
    runName: typeof runMeta.name === "string"
      ? runMeta.name
      : runMeta.offCycle
        ? "Off-cycle payroll"
        : null,
    payrollReference: String(runRow.id),
    documentReference,
    note: typeof runMeta.note === "string" ? runMeta.note : null,
    transferEtid: lineRow.transfer_etid,
  })

    const upload = await admin.storage.from("payroll-documents").upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: false,
    })
    if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw upload.error

    const contentHash = createHash("sha256").update(pdf).digest("hex")
    const inserted = await admin
      .from("payroll_documents")
      .upsert({
        business_id: businessId,
        run_id: runId,
        line_id: lineId,
        person_id: lineRow.person_id,
        user_id: connection?.user_id ?? null,
        type: documentType,
        status: "ready",
        filename,
        storage_path: storagePath,
        content_hash: contentHash,
        template_version: 1,
        metadata: {
          documentReference,
          businessName,
          payeeName: String(snap.fullName || "Payee"),
          amount,
          currency,
          payPeriodStart: runRow.pay_period_start ?? null,
          payPeriodEnd: runRow.pay_period_end ?? null,
          payday: runRow.payday ?? runRow.scheduled_for ?? null,
          paidAt: settledAt,
          reversalOccurredAt: options.reversalOccurredAt ?? null,
          rail,
          transferEtid: lineRow.transfer_etid,
          reversalTransactionId: options.reversalTransactionId ?? null,
        },
      }, { onConflict: "line_id,type" })
      .select("id")
      .single()
    if (inserted.error) throw inserted.error
    documentId = String(inserted.data.id)
    await admin.from("payroll_run_events").insert({
      business_id: businessId,
      run_id: runId,
      person_id: lineRow.person_id,
      event_type: "document.generated",
      data: { documentId, lineId, filename, contentHash },
    })
    if (!isReversal) {
      await admin.from("payroll_lines").update({
        stub_storage_path: storagePath,
        payroll_document_id: documentId,
        settled_at: settledAt,
        updated_at: new Date().toISOString(),
      }).eq("id", lineId)
    }
    if (!isReversal && lineRow.transfer_etid) {
      const { data: transactions } = await admin.from("transactions")
        .select("id,metadata")
        .eq("easner_transaction_id", lineRow.transfer_etid)
      for (const transaction of transactions ?? []) {
        await admin.from("transactions").update({
          metadata: {
            ...((transaction.metadata as Record<string, unknown>) ?? {}),
            payroll_document_id: documentId,
            payroll_document_filename: filename,
          },
          updated_at: new Date().toISOString(),
        }).eq("id", transaction.id)
      }
    }
  }

  if (!email) return

  const maskedEmail = email.replace(/^(.).*(?=@)/, "$1***")
  if (!options.forceEmail) {
    const { data: completedDelivery } = await admin
      .from("payroll_document_deliveries")
      .select("id")
      .eq("document_id", documentId)
      .in("status", ["sent", "delivered"])
      .limit(1)
      .maybeSingle()
    if (completedDelivery) return
  }
  const delivery = options.deliveryId
    ? { data: { id: options.deliveryId } }
    : await admin.from("payroll_document_deliveries").insert({
        document_id: documentId,
        channel: "email",
        destination_masked: maskedEmail,
        status: "queued",
        attempts: 0,
      }).select("id").single()
  const nextAttempt = Number(options.deliveryAttempts ?? 0) + 1

  ensureSendGrid()
  try {
    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL || "noreply@easner.com",
      subject: isReversal
        ? `Payroll payment reversed by ${businessName}`
        : `You've been paid by ${businessName}`,
      text: isReversal
        ? `A payroll payment of ${formatCurrency(amount, currency)} from ${businessName} was reversed. The reversal document is attached.`
        : `Payroll payment received. You received ${formatCurrency(amount, currency)} from ${businessName}. Your pay stub is attached.`,
      html: isReversal
        ? `<h1>Payroll payment reversed</h1><p>A payroll payment of <strong>${formatCurrency(amount, currency)}</strong> from <strong>${businessName}</strong> was reversed.</p><p>Your reversal document is attached.</p>`
        : `<h1>Payroll payment received</h1><p>You received <strong>${formatCurrency(amount, currency)}</strong> from <strong>${businessName}</strong>.</p><p>Your pay stub is attached.</p><p><a href="https://app.easner.com/payroll">View payroll payment</a></p>`,
      attachments: [{
        content: pdf.toString("base64"),
        filename,
        type: "application/pdf",
        disposition: "attachment",
      }],
    })
    if (delivery.data?.id) {
      await admin.from("payroll_document_deliveries").update({
        status: "sent",
        attempts: nextAttempt,
        last_error: null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", delivery.data.id)
    }
  } catch (error) {
    if (delivery.data?.id) {
      await admin.from("payroll_document_deliveries").update({
        status: "failed",
        attempts: nextAttempt,
        last_error: error instanceof Error ? error.message : "Email failed",
        updated_at: new Date().toISOString(),
      }).eq("id", delivery.data.id)
    }
    throw error
  }
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
