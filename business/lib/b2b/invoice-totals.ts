function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

export function computeInvoiceTotals(input: {
  subtotal: number
  taxRate: number
  discountRate: number
}): {
  discount: number
  taxableBase: number
  tax: number
  total: number
} {
  const s = Math.max(0, Number.isFinite(input.subtotal) ? input.subtotal : 0)
  const tr = clamp(typeof input.taxRate === "number" ? input.taxRate : Number(input.taxRate), 0, 100)
  const dr = clamp(
    typeof input.discountRate === "number" ? input.discountRate : Number(input.discountRate),
    0,
    100
  )
  const discount = s * (dr / 100)
  const taxableBase = Math.max(0, s - discount)
  const tax = taxableBase * (tr / 100)
  const total = taxableBase + tax
  return { discount, taxableBase, tax, total }
}

/** Resolved discount amount for display (prefers persisted `discount`, else subtotal × rate). */
export function getInvoiceDiscountAmount(invoice: {
  subtotal?: number
  discount?: number
  discountRate?: number
  lineItems: { amount: number }[]
}): number {
  const subtotal =
    invoice.subtotal != null && Number.isFinite(invoice.subtotal)
      ? invoice.subtotal
      : invoice.lineItems.reduce((s, i) => s + i.amount, 0)
  if (invoice.discount != null && invoice.discount > 0) return invoice.discount
  const dr = invoice.discountRate ?? 0
  return subtotal * (dr / 100)
}
