import { sendMail } from "@easner/server"
import { resolveReceiptFromEmail } from "@/lib/invoices/invoice-from-email"
import {
  generateCheckoutPayerReceiptEmailHtml,
  generateCheckoutPayerReceiptEmailText,
  getCheckoutPayerReceiptEmailSubject,
  type CheckoutPayerReceiptEmailData,
} from "@/lib/checkout/checkout-payer-receipt-template"

export async function sendCheckoutPayerReceiptEmail(
  to: string,
  data: CheckoutPayerReceiptEmailData,
): Promise<{ success: boolean; error?: string }> {
  const recipient = to.trim()
  if (!recipient) {
    return { success: false, error: "Payer email is required" }
  }

  try {
    const { email: fromEmail, name: fromName } = resolveReceiptFromEmail()
    const businessName = data.businessName.trim() || "Business"
    const replyTo = data.businessReplyEmail.trim() || fromEmail

    const result = await sendMail({
      to: recipient,
      from: { email: fromEmail, name: fromName },
      replyTo,
      subject: getCheckoutPayerReceiptEmailSubject(businessName),
      html: generateCheckoutPayerReceiptEmailHtml({ ...data, businessName, businessReplyEmail: replyTo }),
      text: generateCheckoutPayerReceiptEmailText({ ...data, businessName, businessReplyEmail: replyTo }),
    })
    if (!result.success) return { success: false, error: result.error }
    return { success: true }
  } catch (err) {
    console.error("Failed to send checkout payer receipt:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}
