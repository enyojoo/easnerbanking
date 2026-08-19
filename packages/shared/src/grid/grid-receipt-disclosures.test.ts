import { describe, expect, it } from "vitest"
import {
  FOREIGN_REMITTANCE_DISCLOSURE,
  GRID_RECEIPT_DISCLOSURES,
  buildGridReceiptEmailDetailRows,
  classifyGridEmailProduct,
  renderGridReceiptDisclosureHtml,
  withGridVaFundingReceiptIdentityRows,
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

  it("builds fiat-only detail rows with Transaction ID before Reference ID", () => {
    const rows = buildGridReceiptEmailDetailRows({
      gridTransactionId: "Transaction:abc",
      easnerTransactionId: "ETID12345678",
      senderName: "Acme",
      recipientName: "Bob",
      transferAmountDisplay: "$100",
      totalToRecipientDisplay: "₦2,000",
      totalTransferFeesDisplay: "$2.50",
      totalDisplay: "$102.50",
      exchangeRateDisplay: "1 USD = 1500.0000 NGN",
      transactionType: "Cross-border send",
      settledAtDisplay: "Aug 12, 2026, 1:00 PM UTC",
    })
    expect(rows[0]).toEqual({ label: "Transaction ID", value: "ETID12345678" })
    expect(rows[1]).toEqual({ label: "Reference ID", value: "Transaction:abc" })
    expect(rows.find((r) => r.label === "Total to recipient")?.value).toBe("₦2,000")
    expect(rows.map((r) => r.label)).not.toContain("Transaction Hash")
  })

  it("renders disclosure HTML with optional foreign remittance line", () => {
    const html = renderGridReceiptDisclosureHtml({ includeForeignRemittanceDisclosure: true })
    expect(html).toContain("Lightspark Payments, LLC")
    expect(html).toContain("NMLS ID 2429193")
    expect(html).toContain(FOREIGN_REMITTANCE_DISCLOSURE)
  })

  it("classifies Grid products for Lightspark overlay", () => {
    expect(
      classifyGridEmailProduct({
        provider: "grid",
        direction: "out",
        metadata: { payout_type: "global_fiat", grid_mode: "balance_payout" },
      }),
    ).toBe("payout")
    expect(
      classifyGridEmailProduct({
        provider: "grid",
        direction: "in",
        metadata: { flow: "bank_onramp", fiat_deposit_currency: "USD" },
      }),
    ).toBe("va_funding")
    expect(
      classifyGridEmailProduct({
        provider: "grid",
        direction: "in",
        metadata: { flow: "bank_onramp", deposit_kind: "verification" },
      }),
    ).toBe("bank_verification")
    expect(
      classifyGridEmailProduct({
        provider: "grid",
        direction: "in",
        metadata: { source: "invoice_stripe", invoice_id: "inv_1" },
      }),
    ).toBeNull()
  })

  it("prepends Transaction ID then Reference ID on VA funding rows", () => {
    const rows = withGridVaFundingReceiptIdentityRows(
      [{ label: "Sender", value: "Acme" }],
      { easnerTransactionId: "ETID1", gridReferenceId: "Transaction:abc" },
    )
    expect(rows.slice(0, 2)).toEqual([
      { label: "Transaction ID", value: "ETID1" },
      { label: "Reference ID", value: "Transaction:abc" },
    ])
  })
})
