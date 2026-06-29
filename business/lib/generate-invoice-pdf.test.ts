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
  status: "open",
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

  it("renders with bank account only", async () => {
    const buf = await generateInvoicePdfBuffer(baseInvoice, {
      id: "acc-1",
      currency: "USD",
      accountName: "Test Biz",
      fullAccountNumber: "123456789",
      routingNumber: "021000021",
      bankName: "Test Bank",
      balance: 0,
    })
    expect(buf.length).toBeGreaterThan(500)
  })

  it("renders with stablecoin only (no bank column)", async () => {
    const buf = await generateInvoicePdfBuffer(
      baseInvoice,
      undefined,
      {
        currency: "USD",
        stablecoin: "USDC",
        chain: "Ethereum",
        address: "0x1234567890abcdef1234567890abcdef12345678",
      },
    )
    expect(buf.length).toBeGreaterThan(500)
  })
})
