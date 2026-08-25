"use client"

/**
 * Lazy facade: the implementation statically imports @react-pdf/renderer
 * (~407 KB gzip incl. a base64-inlined WASM binary), which used to ship in
 * the bundle of every page that merely SHOWS a "Download PDF" button. The
 * renderer now loads on first click.
 */
type Impl = typeof import("./use-invoice-pdf-impl")

export const downloadInvoicePdf: Impl["downloadInvoicePdf"] = async (...args) => {
  const mod = await import("./use-invoice-pdf-impl")
  return mod.downloadInvoicePdf(...args)
}
