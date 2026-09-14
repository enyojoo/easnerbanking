import { describe, expect, it } from "vitest"
import { buildRawMimeMessage } from "./mime-message"

describe("buildRawMimeMessage", () => {
  it("includes html, text, and a PDF part", () => {
    const raw = Buffer.from(
      buildRawMimeMessage({
        to: "payer@example.com",
        from: { email: "invoices@easner.com", name: "Easner Business" },
        replyTo: "support@merchant.com",
        subject: "Invoice 1001",
        html: "<p>Pay</p>",
        text: "Pay",
        attachments: [
          {
            content: Buffer.from("%PDF").toString("base64"),
            filename: "Invoice-1001.pdf",
            type: "application/pdf",
          },
        ],
      }),
    ).toString("utf8")

    expect(raw).toContain("From: Easner Business <invoices@easner.com>")
    expect(raw).toContain("Reply-To: support@merchant.com")
    expect(raw).toContain("Content-Type: text/html")
    expect(raw).toContain("Invoice-1001.pdf")
    expect(raw).toContain("application/pdf")
  })
})
