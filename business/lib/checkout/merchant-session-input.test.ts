import { describe, expect, it } from "vitest"
import {
  parseIdempotencyKeyHeader,
  parseMerchantLineItems,
  validateMerchantMetadata,
} from "./merchant-session-input"

describe("validateMerchantMetadata", () => {
  it("accepts plain string metadata", () => {
    const result = validateMerchantMetadata({ order_id: "1234", plan: "pro" })
    expect(result).toEqual({ ok: true, metadata: { order_id: "1234", plan: "pro" } })
  })

  it("refuses the easner_ namespace regardless of case", () => {
    const result = validateMerchantMetadata({ Easner_business_id: "spoof" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("metadata_key_reserved")
  })

  it("caps key count and value length", () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]))
    expect(validateMerchantMetadata(many).ok).toBe(false)
    expect(validateMerchantMetadata({ a: "x".repeat(501) }).ok).toBe(false)
  })

  it("treats missing metadata as empty", () => {
    expect(validateMerchantMetadata(undefined)).toEqual({ ok: true, metadata: {} })
  })
})

describe("parseMerchantLineItems", () => {
  it("honors every item and sums quantities", () => {
    const result = parseMerchantLineItems([
      { name: "Pro plan", amount: 4900 },
      { name: "Seats", amount: 500, quantity: 3, description: "Extra seats" },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.items).toHaveLength(2)
      expect(result.totalCents).toBe(4900 + 1500)
    }
  })

  it("rejects a non-positive amount", () => {
    const result = parseMerchantLineItems([{ name: "Free", amount: 0 }])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("line_item_amount_invalid")
  })

  it("rejects a missing name", () => {
    const result = parseMerchantLineItems([{ amount: 100 }])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("line_item_name_invalid")
  })
})

describe("parseIdempotencyKeyHeader", () => {
  it("returns null when absent", () => {
    expect(parseIdempotencyKeyHeader(null)).toEqual({ ok: true, key: null })
  })

  it("trims and returns the key", () => {
    expect(parseIdempotencyKeyHeader("  order-42 ")).toEqual({ ok: true, key: "order-42" })
  })

  it("rejects oversized keys", () => {
    const result = parseIdempotencyKeyHeader("x".repeat(300))
    expect(result.ok).toBe(false)
  })
})
