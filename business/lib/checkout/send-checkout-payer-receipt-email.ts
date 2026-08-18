import sgMail from "@sendgrid/mail"
import { resolveInvoiceFromEmail } from "@/lib/invoices/invoice-from-email"
import {
  generateCheckoutPayerReceiptEmailHtml,
  generateCheckoutPayerReceiptEmailText,
  getCheckoutPayerReceiptEmailSubject,
  type CheckoutPayerReceiptEmailData,
} from "@/lib/checkout/checkout-payer-receipt-template"

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

export async function sendCheckoutPayerReceiptEmail(
  to: string,
  data: CheckoutPayerReceiptEmailData,
): Promise<{ success: boolean; error?: string }> {
  const recipient = to.trim()
  if (!recipient) {
    return { success: false, error: "Payer email is required" }
  }

  try {
    ensureSendGridInitialized()
    const { email: fromEmail, name: fromName } = resolveInvoiceFromEmail()
    const businessName = data.businessName.trim() || "Business"
    const replyTo = data.businessReplyEmail.trim() || fromEmail

    await sgMail.send({
      to: recipient,
      from: { email: fromEmail, name: fromName },
      replyTo,
      subject: getCheckoutPayerReceiptEmailSubject(businessName),
      html: generateCheckoutPayerReceiptEmailHtml({ ...data, businessName, businessReplyEmail: replyTo }),
      text: generateCheckoutPayerReceiptEmailText({ ...data, businessName, businessReplyEmail: replyTo }),
    })
    return { success: true }
  } catch (err) {
    console.error("Failed to send checkout payer receipt:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
