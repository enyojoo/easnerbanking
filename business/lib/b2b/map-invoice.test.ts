import { describe, expect, it } from "vitest"
import { mergeInvoicePatch, mapRowToInvoice, type B2bInvoiceRow } from "./map-invoice"
import type { Invoice } from "./types"

function sampleRow(): B2bInvoiceRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    business_id: "22222222-2222-2222-2222-222222222222",
    customer_id: "33333333-3333-3333-3333-333333333333",
    invoice_number: "EINV-100",
    amount_cents: 15000,
    currency: "USD",
    status: "open",
    due_date: "2026-07-01",
    line_items: [
      { description: "Consulting", quantity: 1, unitPrice: 150, amount: 150 },
    ],
    tax_rate: 0,
    bill_to_type: "individual",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    customer_phone: null,
    customer_company: null,
    customer_address: null,
    metadata: {
      memo: "Thanks for your business",
      notes: [{ id: "n1", text: "Internal note", createdAt: "2026-06-01T00:00:00.000Z" }],
      statusHistory: [{ status: "open", timestamp: "2026-06-01T00:00:00.000Z" }],
    },
    created_at: "2026-06-01T12:00:00.000Z",
  }
}

function sampleInvoice(): Invoice {
  return mapRowToInvoice(sampleRow())
}

describe("mergeInvoicePatch", () => {
  it("status-only patch preserves customer, line items, amount, memo, notes", () => {
    const existing = sampleInvoice()
    const patch = {
      status: "sent" as const,
      statusHistory: [
        ...(existing.statusHistory ?? []),
        { status: "sent", timestamp: "2026-06-02T00:00:00.000Z" },
      ],
    }
    const merged = mergeInvoicePatch(existing, patch)

    expect(merged.status).toBe("sent")
    expect(merged.customerName).toBe("Jane Doe")
    expect(merged.customerEmail).toBe("jane@example.com")
    expect(merged.lineItems).toHaveLength(1)
    expect(merged.lineItems[0].description).toBe("Consulting")
    expect(merged.total).toBe(150)
    expect(merged.memo).toBe("Thanks for your business")
    expect(merged.notes).toHaveLength(1)
    expect(merged.invoiceNumber).toBe("EINV-100")
  })

  it("add-note patch appends without clearing other metadata", () => {
    const existing = sampleInvoice()
    const newNote = {
      id: "n2",
      text: "Follow up next week",
      createdAt: "2026-06-03T00:00:00.000Z",
    }
    const merged = mergeInvoicePatch(existing, {
      notes: [...(existing.notes ?? []), newNote],
    })

    expect(merged.notes).toHaveLength(2)
    expect(merged.memo).toBe("Thanks for your business")
    expect(merged.customerName).toBe("Jane Doe")
    expect(merged.total).toBe(150)
  })

  it("archive patch preserves all fields", () => {
    const existing = sampleInvoice()
    const merged = mergeInvoicePatch(existing, { archived: true })

    expect(merged.archived).toBe(true)
    expect(merged.customerName).toBe("Jane Doe")
    expect(merged.lineItems).toHaveLength(1)
    expect(merged.status).toBe("open")
  })

  it("mark-as-paid patch sets paymentInfo without data loss", () => {
    const existing = sampleInvoice()
    const paymentInfo = {
      paidAt: "2026-06-05T00:00:00.000Z",
      method: "cash" as const,
      cashNote: "Wire received",
    }
    const merged = mergeInvoicePatch(existing, {
      status: "paid",
      paymentInfo,
      statusHistory: [
        ...(existing.statusHistory ?? []),
        { status: "paid", timestamp: paymentInfo.paidAt },
      ],
    })

    expect(merged.status).toBe("paid")
    expect(merged.paymentInfo).toEqual(paymentInfo)
    expect(merged.customerEmail).toBe("jane@example.com")
    expect(merged.total).toBe(150)
  })
})
