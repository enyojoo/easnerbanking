import crypto from "crypto"
import { describe, expect, it } from "vitest"
import { gridDiscoverySupportsCorridor } from "@/lib/grid/discoveries"
import {
  parseGridSignatureBytes,
  verifyGridWebhookSignature,
} from "@/lib/grid/webhook-verify"
import { buildGridIndividualCustomerPayload } from "@/lib/grid/kyc-metadata"
import {
  buildGridBusinessCustomerPayload,
  gridShellBusinessTaxId,
} from "@/lib/grid/business-kyc-metadata"
import { buildGridIdempotencyKey } from "@/lib/grid/idempotency"
import { resolvePrimaryPayoutProvider } from "@easner/shared"

describe("gridDiscoverySupportsCorridor", () => {
  it("matches KES mobile money corridor", () => {
    const ok = gridDiscoverySupportsCorridor({
      discoveries: [
        { country: "KE", currency: "KES", paymentRails: ["MOBILE_MONEY", "BANK_TRANSFER"] },
      ],
      countryCode: "KE",
      currencyCode: "KES",
      rail: "mobile_money",
    })
    expect(ok).toBe(true)
  })

  it("rejects mismatched currency", () => {
    const ok = gridDiscoverySupportsCorridor({
      discoveries: [{ country: "KE", currency: "KES", paymentRails: ["BANK_TRANSFER"] }],
      countryCode: "NG",
      currencyCode: "NGN",
      rail: "bank_transfer",
    })
    expect(ok).toBe(false)
  })
})

describe("grid webhook verify", () => {
  it("verifies ECDSA SHA-256 signature (JSON header format)", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    })
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString()
    const body = Buffer.from('{"type":"TEST","data":{}}')
    const sign = crypto.createSign("SHA256")
    sign.update(body)
    sign.end()
    const signature = sign.sign(privateKey)
    const header = JSON.stringify({ v: "1", s: signature.toString("base64") })

    expect(parseGridSignatureBytes(header)?.length).toBeGreaterThan(0)
    expect(verifyGridWebhookSignature(body, header, pubPem)).toBe(true)
    expect(verifyGridWebhookSignature(body, "bad", pubPem)).toBe(false)
  })
})

describe("buildGridBusinessCustomerPayload", () => {
  it("uses a 9-digit shell taxId when org has none", () => {
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId: "easner_business_abc",
      profile: {
        legalName: "Acme Ltd",
        email: "owner@example.com",
        createdAt: "2024-06-01T00:00:00Z",
      },
    })
    const taxId = (payload.businessInfo as { taxId?: string }).taxId
    expect(taxId).toMatch(/^\d{9}$/)
    expect(taxId).toBe(gridShellBusinessTaxId("easner_business_abc"))
  })

  it("normalizes stored EIN-style tax ids", () => {
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId: "easner_business_abc",
      profile: {
        legalName: "Acme Ltd",
        email: "owner@example.com",
        taxId: "12-3456789",
        createdAt: "2024-06-01T00:00:00Z",
      },
    })
    expect((payload.businessInfo as { taxId?: string }).taxId).toBe("123456789")
  })
})

describe("buildGridIndividualCustomerPayload", () => {
  it("maps Noah-style profile to Grid customer", () => {
    const payload = buildGridIndividualCustomerPayload({
      platformCustomerId: "easner_user_abc",
      profile: {
        fullName: "Jane Doe",
        residenceCountry: "US",
        email: "jane@example.com",
        dateOfBirth: "1990-01-01",
      },
    })
    expect(payload.platformCustomerId).toBe("easner_user_abc")
    expect(payload.customerType).toBe("INDIVIDUAL")
    expect(payload.fullName).toBe("Jane Doe")
  })
})

describe("buildGridIdempotencyKey", () => {
  it("is stable for identical bodies and changes when body differs", () => {
    const bodyA = {
      source: { sourceType: "REALTIME_FUNDING", customerId: "Customer:abc", currency: "USDC" },
      destination: { destinationType: "ACCOUNT", accountId: "ext_1" },
      lockedCurrencyAmount: 200000,
      lockedCurrencySide: "RECEIVING",
      purposeOfPayment: "FAMILY_SUPPORT",
    }
    const bodyB = { ...bodyA, destination: { destinationType: "ACCOUNT", accountId: "ext_2" } }
    const keyA1 = buildGridIdempotencyKey("grid_quote_Customer:abc", bodyA)
    const keyA2 = buildGridIdempotencyKey("grid_quote_Customer:abc", bodyA)
    const keyB = buildGridIdempotencyKey("grid_quote_Customer:abc", bodyB)
    expect(keyA1).toBe(keyA2)
    expect(keyA1).not.toBe(keyB)
    expect(keyA1.startsWith("grid_quote_Customer:abc_")).toBe(true)
  })
})

describe("isGridBalancePayoutQuote heuristics", () => {
  function isGridBalancePayoutQuote(input: {
    payoutProvider?: string | null
    formSessionId?: string | null
    gridQuoteId?: string | null
    gridFundingAddress?: string | null
  }): boolean {
    if (String(input.payoutProvider || "").toLowerCase() === "grid") return true
    const q = String(input.gridQuoteId || "").trim()
    if (q.startsWith("Quote:")) return true
    const fs = String(input.formSessionId || "").trim()
    if (fs.startsWith("grid_quote_")) return true
    if (String(input.gridFundingAddress || "").trim()) return true
    return false
  }

  it("detects grid quote heuristics", () => {
    expect(isGridBalancePayoutQuote({ payoutProvider: "grid" })).toBe(true)
    expect(isGridBalancePayoutQuote({ gridQuoteId: "Quote:abc" })).toBe(true)
    expect(isGridBalancePayoutQuote({ formSessionId: "grid_quote_xyz" })).toBe(true)
    expect(isGridBalancePayoutQuote({ gridFundingAddress: "So111" })).toBe(true)
    expect(isGridBalancePayoutQuote({ formSessionId: "noah-session" })).toBe(false)
  })
})

describe("resolvePrimaryPayoutProvider with grid", () => {
  it("returns grid when priority 1", () => {
    expect(
      resolvePrimaryPayoutProvider([
        { provider: "grid", priority: 1 },
        { provider: "noah", priority: 2 },
      ]),
    ).toBe("grid")
  })
})

describe("grid provider registry", () => {
  it("registers grid alongside noah and yellowcard", async () => {
    const { gridPayoutProvider, noahPayoutProvider, yellowcardPayoutProvider } = await import(
      "@/lib/payout-providers"
    )
    expect(gridPayoutProvider.id).toBe("grid")
    expect(noahPayoutProvider.id).toBe("noah")
    expect(yellowcardPayoutProvider.id).toBe("yellowcard")
  })
})
