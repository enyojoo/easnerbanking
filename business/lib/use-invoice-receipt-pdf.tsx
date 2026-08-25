"use client"

/**
 * Lazy facade over the @react-pdf/renderer implementation — see
 * use-invoice-pdf.tsx for why. The renderer loads on first click.
 */
type Impl = typeof import("./use-invoice-receipt-pdf-impl")

export const downloadInvoiceReceiptPdf: Impl["downloadInvoiceReceiptPdf"] = async (...args) => {
  const mod = await import("./use-invoice-receipt-pdf-impl")
  return mod.downloadInvoiceReceiptPdf(...args)
}
