import sgMail from "@sendgrid/mail"
import {
  generateInvoiceEmailHtml,
  generateInvoiceEmailText,
  getInvoiceEmailSubject,
  type InvoiceEmailData,
} from "@/lib/invoice-email-template"
import { businessInfo } from "@/lib/business-info"
import type { Invoice } from "@/lib/b2b/types"

let apiKeyInitialized = false

function ensureSendGridInitialized() {
  if (!apiKeyInitialized) {
    const key = process.env.SENDGRID_API_KEY
    if (!key) {
      throw new Error("SENDGRID_API_KEY environment variable is required")
    }
    sgMail.setApiKey(key)
    apiKeyInitialized = true
  }
}

export interface SendInvoiceEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendInvoiceEmail(
  invoice: Invoice,
  invoiceViewUrl: string,
  pdfBuffer: Buffer,
  options?: { businessName?: string; businessReplyEmail: string },
): Promise<SendInvoiceEmailResult> {
  if (!invoice.customerEmail?.trim()) {
    return { success: false, error: "Invoice has no customer email" }
  }

  const businessReplyEmail = options?.businessReplyEmail?.trim()
  if (!businessReplyEmail) {
    return {
      success: false,
      error: "Business reply email is required for invoice delivery",
    }
  }

  try {
    ensureSendGridInitialized()

    const fromEmail =
      process.env.SENDGRID_FROM_EMAIL_BUSINESS ||
      process.env.SENDGRID_FROM_EMAIL ||
      "invoices@easner.com"
    const fromName =
      process.env.SENDGRID_FROM_NAME_BUSINESS ||
      process.env.SENDGRID_FROM_NAME ||
      "Easner Business"
    const businessName = options?.businessName?.trim() || businessInfo.name

    const data: InvoiceEmailData = {
      invoice,
      invoiceViewUrl,
      businessName,
      businessReplyEmail,
    }

    const html = generateInvoiceEmailHtml(data)
    const text = generateInvoiceEmailText(data)
    const subject = getInvoiceEmailSubject(data)

    const msg = {
      to: invoice.customerEmail,
      from: { email: fromEmail, name: fromName },
      replyTo: businessReplyEmail,
      subject,
      html,
      text,
      attachments: [
        {
          content: pdfBuffer.toString("base64"),
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    }

    const [response] = await sgMail.send(msg)
    const messageId = response.headers["x-message-id"] as string | undefined

    return { success: true, messageId }
  } catch (err) {
    console.error("Failed to send invoice email:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export async function sendInvoiceViewNotificationEmail(input: {
  to: string
  businessName: string
  invoice: Invoice
}): Promise<SendInvoiceEmailResult> {
  try {
    ensureSendGridInitialized()
    const fromEmail =
      process.env.SENDGRID_FROM_EMAIL_BUSINESS ||
      process.env.SENDGRID_FROM_EMAIL ||
      "invoices@easner.com"
    const fromName =
      process.env.SENDGRID_FROM_NAME_BUSINESS ||
      process.env.SENDGRID_FROM_NAME ||
      "Easner Business"

    const subject = `Customer viewed invoice ${input.invoice.invoiceNumber}`
    const text = `${input.invoice.customerName || "A customer"} viewed invoice ${input.invoice.invoiceNumber} for ${input.invoice.currency} ${input.invoice.total}.`
    const html = `<p>${text}</p>`

    await sgMail.send({
      to: input.to,
      from: { email: fromEmail, name: fromName },
      subject,
      text,
      html,
    })
    return { success: true }
  } catch (err) {
    console.error("Failed to send invoice view notification:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export async function sendInvoiceReceiptEmail(input: {
  invoice: Invoice
  pdfBuffer: Buffer
  businessName?: string
  businessReplyEmail: string
  invoiceViewUrl?: string
}): Promise<SendInvoiceEmailResult> {
  if (!input.invoice.customerEmail?.trim()) {
    return { success: false, error: "Invoice has no customer email" }
  }

  try {
    ensureSendGridInitialized()
    const fromEmail =
      process.env.SENDGRID_FROM_EMAIL_BUSINESS ||
      process.env.SENDGRID_FROM_EMAIL ||
      "invoices@easner.com"
    const fromName =
      process.env.SENDGRID_FROM_NAME_BUSINESS ||
      process.env.SENDGRID_FROM_NAME ||
      "Easner Business"
    const businessName = input.businessName?.trim() || businessInfo.name

    const subject = `Payment received for invoice ${input.invoice.invoiceNumber}`
    const text = `Thank you — we received your payment for invoice ${input.invoice.invoiceNumber} (${input.invoice.currency} ${input.invoice.total}).`
    const html = `<p>${text}</p>${input.invoiceViewUrl ? `<p><a href="${input.invoiceViewUrl}">View invoice</a></p>` : ""}`

    await sgMail.send({
      to: input.invoice.customerEmail,
      from: { email: fromEmail, name: fromName },
      replyTo: input.businessReplyEmail,
      subject,
      text,
      html,
      attachments: [
        {
          content: input.pdfBuffer.toString("base64"),
          filename: `Receipt-${input.invoice.invoiceNumber}.pdf`,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    })
    return { success: true }
  } catch (err) {
    console.error("Failed to send receipt email:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
