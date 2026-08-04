import { describe, expect, it } from "vitest"
import { generateInvoicePdfBuffer } from "@/lib/generate-invoice-pdf"
import type { Invoice } from "@/lib/b2b/types"

const baseInvoice: Invoice = {
  id: "00000000-0000-4000-8000-000000000001",
  invoiceNumber: "EINV-TESTPDF001",
  customerName: "Acme Corp",
  customerEmail: "billing@acme.test",
  total: 150,
  currency: "USD",
  status: "unpaid",
  dueDate: "2026-07-01",
  createdDate: "2026-06-01T12:00:00.000Z",
  finalizedDate: "2026-06-01T12:00:00.000Z",
  frequency: null,
  lineItems: [
    { description: "Consulting", quantity: 1, unitPrice: 150, amount: 150 },
  ],
}

describe("generateInvoicePdfBuffer", () => {
  it("renders a PDF without payment options", async () => {
    const buf = await generateInvoicePdfBuffer(baseInvoice)
    expect(buf.length).toBeGreaterThan(500)
    expect(buf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("renders with payment link section", async () => {
    const buf = await generateInvoicePdfBuffer(baseInvoice, undefined, {
      url: "https://business.easner.com/invoice/acme/einv-testpdf001",
      hasOnline: true,
      hasBank: true,
      hasStablecoin: false,
    })
    expect(buf.length).toBeGreaterThan(500)
  })

  it("renders EUR invoice", async () => {
    const buf = await generateInvoicePdfBuffer({ ...baseInvoice, currency: "EUR", total: 250.5 })
    expect(buf.length).toBeGreaterThan(500)
  })
})
