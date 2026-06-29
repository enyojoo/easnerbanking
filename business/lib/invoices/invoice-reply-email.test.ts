import { describe, expect, it } from "vitest"
import {
  pickInvoiceReplyEmail,
  pickInvoiceReplyEmailWithSource,
  invoiceCustomerContactLine,
} from "./invoice-reply-email"

describe("pickInvoiceReplyEmailWithSource", () => {
  it("returns source with resolved email", () => {
    expect(
      pickInvoiceReplyEmailWithSource({
        supportEmail: "billing@acme.com",
        ownerEmail: "owner@acme.com",
        senderEmail: "staff@acme.com",
      }),
    ).toEqual({ email: "billing@acme.com", source: "support" })

    expect(
      pickInvoiceReplyEmailWithSource({
        supportEmail: "  ",
        ownerEmail: "owner@acme.com",
        senderEmail: "staff@acme.com",
      }),
    ).toEqual({ email: "owner@acme.com", source: "owner" })

    expect(
      pickInvoiceReplyEmailWithSource({
        ownerEmail: "",
        senderEmail: "staff@acme.com",
      }),
    ).toEqual({ email: "staff@acme.com", source: "sender" })

    expect(pickInvoiceReplyEmailWithSource({})).toBeNull()
  })
})

describe("pickInvoiceReplyEmail", () => {
  it("prefers support email from business settings", () => {
    expect(
      pickInvoiceReplyEmail({
        supportEmail: "billing@acme.com",
        ownerEmail: "owner@acme.com",
        senderEmail: "staff@acme.com",
      }),
    ).toBe("billing@acme.com")
  })

  it("falls back to owner then sender", () => {
    expect(
      pickInvoiceReplyEmail({
        supportEmail: "  ",
        ownerEmail: "owner@acme.com",
        senderEmail: "staff@acme.com",
      }),
    ).toBe("owner@acme.com")

    expect(
      pickInvoiceReplyEmail({
        ownerEmail: "",
        senderEmail: "staff@acme.com",
      }),
    ).toBe("staff@acme.com")
  })

  it("returns null when no email is available", () => {
    expect(pickInvoiceReplyEmail({})).toBeNull()
    expect(
      pickInvoiceReplyEmail({ supportEmail: "", ownerEmail: null, senderEmail: undefined }),
    ).toBeNull()
  })

  it("formats customer contact line for invoice footer", () => {
    expect(invoiceCustomerContactLine("billing@acme.com")).toBe(
      "If you have any questions about this invoice, email billing@acme.com.",
    )
  })
})
