import type { Invoice } from "@/lib/b2b/types"
import { getPaymentRecordDisplay } from "@/lib/deposits"
import {
  formatPaymentMethodText,
  formatPaymentMethodTextBesideIcon,
  hasPaymentBrandIcon,
  paymentMethodIconKey,
} from "@/lib/stripe/payment-method-display"
import { paymentBrandPngDataUrl } from "@/lib/stripe/payment-brand-png-data"

export type InvoiceEmailPaymentMethodDisplay = {
  /** Plain-text email line (includes brand name when no chip). */
  plainText: string
  /** HTML value beside brand chip (mask / wallet only). */
  htmlText: string
  /** PNG data URL for email clients (SVG is unreliable in email). */
  brandIconSrc?: string
}

/** Payment method row for customer invoice emails — matches receipt PDF / in-app chip layout. */
export function resolveInvoiceEmailPaymentMethod(
  invoice: Invoice,
): InvoiceEmailPaymentMethodDisplay | null {
  const record = getPaymentRecordDisplay(invoice)
  if (!record) return null

  if (record.method === "stripe") {
    const pm = record.stripePaymentMethod
    if (!pm?.type) {
      return { plainText: "Paid online", htmlText: "Paid online" }
    }
    const iconKey = paymentMethodIconKey(pm)
    const brandIconSrc = hasPaymentBrandIcon(pm) ? paymentBrandPngDataUrl(iconKey) : null
    const plainText = formatPaymentMethodText(pm).trim() || "Paid online"
    const htmlText = brandIconSrc
      ? formatPaymentMethodTextBesideIcon(pm).trim() || plainText
      : plainText
    return {
      plainText,
      htmlText,
      ...(brandIconSrc ? { brandIconSrc } : {}),
    }
  }

  if (record.method === "cash") {
    return { plainText: "Cash or other method", htmlText: "Cash or other method" }
  }

  if (record.method === "easner") {
    const text = record.paymentMethod?.trim() || "Bank transfer"
    return { plainText: text, htmlText: text }
  }

  return null
}
