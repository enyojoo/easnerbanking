import { describe, expect, it } from "vitest"
import {
  isReceiptPathOwnedByUser,
  manualSendReceiptStoragePath,
  validateManualSendReferenceCode,
} from "./receipt-storage"

describe("manual send receipt storage", () => {
  it("builds user-scoped paths", () => {
    expect(manualSendReceiptStoragePath("user-1", "ETID12345678", "pdf")).toBe(
      "receipts/user-1/ETID12345678.pdf",
    )
  })

  it("validates ETID reference codes", () => {
    expect(validateManualSendReferenceCode("ETID12345678")).toBeNull()
    expect(validateManualSendReferenceCode("bad")).not.toBeNull()
  })

  it("checks path ownership", () => {
    expect(isReceiptPathOwnedByUser("receipts/u1/ETID12345678.pdf", "u1")).toBe(true)
    expect(isReceiptPathOwnedByUser("receipts/u2/ETID12345678.pdf", "u1")).toBe(false)
  })
})
