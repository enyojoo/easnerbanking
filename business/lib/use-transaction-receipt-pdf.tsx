"use client"

/**
 * Lazy facade over the @react-pdf/renderer implementation — see
 * use-invoice-pdf.tsx for why. The renderer loads on first click.
 */
type Impl = typeof import("./use-transaction-receipt-pdf-impl")

export const downloadTransactionReceiptPdf: Impl["downloadTransactionReceiptPdf"] = async (...args) => {
  const mod = await import("./use-transaction-receipt-pdf-impl")
  return mod.downloadTransactionReceiptPdf(...args)
}
