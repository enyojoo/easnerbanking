import { describe, expect, it } from "vitest"
import {
  FOREIGN_REMITTANCE_DISCLOSURE,
  GRID_RECEIPT_DISCLOSURES,
  buildGridReceiptEmailDetailRows,
  renderGridReceiptDisclosureHtml,
} from "./grid-receipt-disclosures"

describe("grid-receipt-disclosures", () => {
  it("keeps Lightspark disclosure strings verbatim", () => {
    expect(GRID_RECEIPT_DISCLOSURES.moneyTransmitter).toBe("Lightspark Payments, LLC")
    expect(GRID_RECEIPT_DISCLOSURES.nmlsId).toBe("2429193")
    expect(GRID_RECEIPT_DISCLOSURES.regulatoryAddress).toBe(
      "8605 Santa Monica Blvd, PMB 64461, West Hollywood, CA 90069",
    )
    expect(GRID_RECEIPT_DISCLOSURES.fraudReporting).toBe(
      "To report fraud or suspected fraud in connection with the money transmission services, please call customer services toll-free at (855) 516-0103.",
    )
    expect(FOREIGN_REMITTANCE_DISCLOSURE).toContain("Recipient may receive less")
  })

  it("builds fiat-only detail rows with Grid ID primary", () => {
    const rows = buildGridReceiptEmailDetailRows({
      gridTransactionId: "Transaction:abc",
      easnerTransactionId: "ET-1",
      senderName: "Acme",
      recipientName: "Bob",
      transferAmountDisplay: "$100",
      totalToRecipientDisplay: "₦150,000",
      totalTransferFeesDisplay: "$2.50",
      totalDisplay: "$102.50",
      exchangeRateDisplay: "1 USD = 1500.0000 NGN",
      transactionType: "Cross-border send",
      settledAtDisplay: "Aug 12, 2026, 1:00 PM UTC",
    })
    expect(rows[0]).toEqual({ label: "Grid transaction ID", value: "Transaction:abc" })
    expect(rows.map((r) => r.label)).not.toContain("Transaction Hash")
  })

  it("renders disclosure HTML with optional foreign remittance line", () => {
    const html = renderGridReceiptDisclosureHtml({ includeForeignRemittanceDisclosure: true })
    expect(html).toContain("Lightspark Payments, LLC")
    expect(html).toContain("NMLS ID 2429193")
    expect(html).toContain(FOREIGN_REMITTANCE_DISCLOSURE)
  })
})
