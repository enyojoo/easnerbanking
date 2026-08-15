import sgMail from "@sendgrid/mail"
import {
  generateInvoiceCustomerRefundEmailHtml,
  generateInvoiceCustomerRefundEmailText,
  generateInvoiceEmailHtml,
  generateInvoiceEmailText,
  generateInvoicePaidNotificationHtml,
  generateInvoicePaidNotificationText,
  generateInvoiceReceiptEmailHtml,
  generateInvoiceReceiptEmailText,
  generateInvoiceRefundedNotificationHtml,
  generateInvoiceRefundedNotificationText,
  generateInvoiceViewedNotificationHtml,
  generateInvoiceViewedNotificationText,
  getInvoiceCustomerRefundEmailSubject,
  getInvoiceEmailSubject,
  getInvoicePaidNotificationSubject,
  getInvoiceReceiptEmailSubject,
  getInvoiceRefundedNotificationSubject,
  getInvoiceViewedNotificationSubject,
  type InvoiceEmailData,
} from "@/lib/invoice-email-template"
import type { InvoicePdfIssuer } from "@/lib/invoices/issuer"
import { resolveInvoiceFromEmail } from "@/lib/invoices/invoice-from-email"
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
  options?: {
    businessName?: string
    businessReplyEmail: string
    issuer?: InvoicePdfIssuer
    includePaymentContext?: boolean
    paymentMethods?: InvoiceEmailData["paymentMethods"]
    reminderType?: InvoiceEmailData["reminderType"]
  },
): Promise<SendInvoiceEmailResult> {
  if (!invoice.customerEmail?.trim()) {
    return { success: false, error: "Invoice has no customer email" }
  }

  const replyEmail = options?.businessReplyEmail?.trim()
  if (!replyEmail) {
    return {
      success: false,
      error: "Business reply email is required for invoice delivery",
    }
  }

  try {
    ensureSendGridInitialized()

    const { email: fromEmail, name: fromName } = resolveInvoiceFromEmail()
    const businessName = options?.businessName?.trim() || options?.issuer?.name?.trim() || "Business"
    const issuer: InvoicePdfIssuer = options?.issuer ?? {
      name: businessName,
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      countryCode: "",
      addressLines: [],
      email: replyEmail,
      phone: "",
    }

    const data: InvoiceEmailData = {
      invoice,
      invoiceViewUrl,
      businessName,
      businessReplyEmail: replyEmail,
      issuer: { ...issuer, name: issuer.name?.trim() || businessName, email: replyEmail },
      includePaymentContext: options?.includePaymentContext,
      paymentMethods: options?.paymentMethods,
      reminderType: options?.reminderType,
    }

    const html = generateInvoiceEmailHtml(data)
    const text = generateInvoiceEmailText(data)
    const subject = getInvoiceEmailSubject(data)

    const msg = {
      to: invoice.customerEmail,
      from: { email: fromEmail, name: fromName },
      replyTo: replyEmail,
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
  manageInvoiceUrl: string
  recipientFirstName?: string
}): Promise<SendInvoiceEmailResult> {
  try {
    ensureSendGridInitialized()
    const { email: fromEmail, name: fromName } = resolveInvoiceFromEmail()
    const templateData = {
      invoice: input.invoice,
      businessName: input.businessName,
      manageInvoiceUrl: input.manageInvoiceUrl,
      recipientFirstName: input.recipientFirstName,
    }

    await sgMail.send({
      to: input.to,
      from: { email: fromEmail, name: fromName },
      subject: getInvoiceViewedNotificationSubject(input.invoice.invoiceNumber),
      text: generateInvoiceViewedNotificationText(templateData),
      html: generateInvoiceViewedNotificationHtml(templateData),
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

export async function sendInvoicePaidNotificationEmail(input: {
  to: string
  businessName: string
  invoice: Invoice
  manageInvoiceUrl: string
  recipientFirstName?: string
  paymentMethodLabel?: string
}): Promise<SendInvoiceEmailResult> {
  try {
    ensureSendGridInitialized()
    const { email: fromEmail, name: fromName } = resolveInvoiceFromEmail()
    const templateData = {
      invoice: input.invoice,
      businessName: input.businessName,
      manageInvoiceUrl: input.manageInvoiceUrl,
      recipientFirstName: input.recipientFirstName,
      paymentMethodLabel: input.paymentMethodLabel,
    }

    await sgMail.send({
      to: input.to,
      from: { email: fromEmail, name: fromName },
      subject: getInvoicePaidNotificationSubject(input.invoice.invoiceNumber),
      text: generateInvoicePaidNotificationText(templateData),
      html: generateInvoicePaidNotificationHtml(templateData),
    })
    return { success: true }
  } catch (err) {
    console.error("Failed to send invoice paid notification:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export async function sendInvoiceRefundedNotificationEmail(input: {
  to: string
  businessName: string
  invoice: Invoice
  manageInvoiceUrl: string
  recipientFirstName?: string
}): Promise<SendInvoiceEmailResult> {
  try {
    ensureSendGridInitialized()
    const { email: fromEmail, name: fromName } = resolveInvoiceFromEmail()
    const templateData = {
      invoice: input.invoice,
      businessName: input.businessName,
      manageInvoiceUrl: input.manageInvoiceUrl,
      recipientFirstName: input.recipientFirstName,
    }

    await sgMail.send({
      to: input.to,
      from: { email: fromEmail, name: fromName },
      subject: getInvoiceRefundedNotificationSubject(input.invoice.invoiceNumber),
      text: generateInvoiceRefundedNotificationText(templateData),
      html: generateInvoiceRefundedNotificationHtml(templateData),
    })
    return { success: true }
  } catch (err) {
    console.error("Failed to send invoice refunded notification:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

export async function sendInvoiceCustomerRefundEmail(input: {
  invoice: Invoice
  businessName?: string
  businessReplyEmail: string
  invoiceViewUrl?: string
  issuer?: InvoicePdfIssuer
}): Promise<SendInvoiceEmailResult> {
  if (!input.invoice.customerEmail?.trim()) {
    return { success: false, error: "Invoice has no customer email" }
  }

  try {
    ensureSendGridInitialized()
    const { email: fromEmail, name: fromName } = resolveInvoiceFromEmail()
    const businessName = input.businessName?.trim() || input.issuer?.name?.trim() || "Business"
    const invoiceViewUrl = input.invoiceViewUrl?.trim() || ""
    const issuer: InvoicePdfIssuer = input.issuer ?? {
      name: businessName,
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      countryCode: "",
      addressLines: [],
      email: input.businessReplyEmail,
      phone: "",
    }
    const templateData = {
      invoice: input.invoice,
      invoiceViewUrl,
      businessName,
      businessReplyEmail: input.businessReplyEmail,
      issuer: { ...issuer, name: issuer.name?.trim() || businessName, email: input.businessReplyEmail },
    }

    await sgMail.send({
      to: input.invoice.customerEmail,
      from: { email: fromEmail, name: fromName },
      replyTo: input.businessReplyEmail,
      subject: getInvoiceCustomerRefundEmailSubject(input.invoice.invoiceNumber),
      text: generateInvoiceCustomerRefundEmailText(templateData),
      html: generateInvoiceCustomerRefundEmailHtml(templateData),
    })
    return { success: true }
  } catch (err) {
    console.error("Failed to send customer refund email:", err)
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
  issuer?: InvoicePdfIssuer
}): Promise<SendInvoiceEmailResult> {
  if (!input.invoice.customerEmail?.trim()) {
    return { success: false, error: "Invoice has no customer email" }
  }

  try {
    ensureSendGridInitialized()
    const { email: fromEmail, name: fromName } = resolveInvoiceFromEmail()
    const businessName = input.businessName?.trim() || input.issuer?.name?.trim() || "Business"
    const invoiceViewUrl = input.invoiceViewUrl?.trim() || ""
    const issuer: InvoicePdfIssuer = input.issuer ?? {
      name: businessName,
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      countryCode: "",
      addressLines: [],
      email: input.businessReplyEmail,
      phone: "",
    }
    const templateData = {
      invoice: input.invoice,
      invoiceViewUrl,
      businessName,
      businessReplyEmail: input.businessReplyEmail,
      issuer: { ...issuer, name: issuer.name?.trim() || businessName, email: input.businessReplyEmail },
    }

    await sgMail.send({
      to: input.invoice.customerEmail,
      from: { email: fromEmail, name: fromName },
      replyTo: input.businessReplyEmail,
      subject: getInvoiceReceiptEmailSubject(input.invoice.invoiceNumber),
      text: generateInvoiceReceiptEmailText(templateData),
      html: generateInvoiceReceiptEmailHtml(templateData),
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
