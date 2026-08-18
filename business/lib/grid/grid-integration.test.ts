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
  buildGridBusinessInfoResyncPatch,
  buildGridBusinessInfoScrubPatch,
  gridBusinessHostedKybBusinessInfoIsOverfilled,
  gridBusinessKybStubFieldsNeedResync,
  gridBusinessTaxIdIsInvalidOnGrid,
  gridShellBusinessTaxId,
  isGridShellBusinessTaxId,
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
  const platformCustomerId = "eb_abc123456789012345678901234567890"

  it("omits taxId, country, and incorporatedOn when org has none (hosted KYB start)", () => {
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId,
      profile: {
        legalName: "Acme Ltd",
        email: "owner@example.com",
        registrationNumber: "10609372",
      },
    })
    const businessInfo = payload.businessInfo as Record<string, unknown>
    expect(businessInfo.taxId).toBeUndefined()
    expect(businessInfo.country).toBeUndefined()
    expect(businessInfo.incorporatedOn).toBeUndefined()
    expect(businessInfo.registrationNumber).toBe("10609372")
  })

  it("omits country and incorporatedOn without a real taxId (hosted KYB)", () => {
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId: "eb_4afbef7f008749c3b5d87807b37710e9",
      profile: {
        legalName: "Fruitful Africa Limited",
        email: "owner@example.com",
        country: "NG",
        createdAt: "2026-08-12T10:41:27.468649+00:00",
      },
    })
    const businessInfo = payload.businessInfo as Record<string, unknown>
    expect(businessInfo.legalName).toBe("Fruitful Africa Limited")
    expect(businessInfo.taxId).toBeUndefined()
    expect(businessInfo.country).toBeUndefined()
    expect(businessInfo.incorporatedOn).toBeUndefined()
  })

  it("sends Grid-required create stubs when forGridCreate is set", () => {
    const platformCustomerId = "eb_4afbef7f008749c3b5d87807b37710e9"
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId,
      forGridCreate: true,
      profile: {
        legalName: "Fruitful Africa Limited",
        email: "owner@example.com",
        country: "NG",
        createdAt: "2026-08-12T10:41:27.468649+00:00",
        registrationNumber: "10609372",
      },
    })
    const businessInfo = payload.businessInfo as Record<string, unknown>
    expect(businessInfo.country).toBe("NG")
    expect(businessInfo.incorporatedOn).toBe("2026-08-12")
    expect(businessInfo.taxId).toBe(gridShellBusinessTaxId(platformCustomerId))
    expect(businessInfo.registrationNumber).toBeUndefined()
  })

  it("normalizes stored EIN-style tax ids", () => {
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId,
      profile: {
        legalName: "Acme Ltd",
        email: "owner@example.com",
        taxId: "12-3456789",
        createdAt: "2024-06-01T00:00:00Z",
      },
    })
    expect((payload.businessInfo as { taxId?: string }).taxId).toBe("123456789")
  })

  it("uses registry number as Grid taxId only for registry-only countries", () => {
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId,
      profile: {
        legalName: "Acme EE",
        email: "owner@example.com",
        country: "EE",
        registrationNumber: "12345678",
        createdAt: "2024-06-01T00:00:00Z",
      },
    })
    expect((payload.businessInfo as { taxId?: string }).taxId).toBe("12345678")
  })

  it("treats stored shell tax ids as empty on create", () => {
    const shell = gridShellBusinessTaxId(platformCustomerId)
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId,
      profile: {
        legalName: "Acme Ltd",
        email: "owner@example.com",
        taxId: shell,
      },
    })
    expect((payload.businessInfo as { taxId?: string }).taxId).toBeUndefined()
    expect(isGridShellBusinessTaxId(shell, platformCustomerId)).toBe(true)
  })

  it("omits address for US businesses so Grid does not treat state CA as Canada", () => {
    const payload = buildGridBusinessCustomerPayload({
      platformCustomerId,
      profile: {
        legalName: "Easner Group, Inc",
        email: "support@example.com",
        country: "United States",
        taxId: "32-0855540",
        addressLine1: "28 Geary St Ste 650",
        city: "San Francisco",
        state: "CA",
        postalCode: "94108",
        createdAt: "2024-06-01T00:00:00Z",
      },
    })
    expect(payload.address).toBeUndefined()
    expect((payload.businessInfo as { country?: string }).country).toBe("US")
    expect((payload.businessInfo as { taxId?: string }).taxId).toBe("320855540")
  })
})

describe("gridBusinessKyb stub resync", () => {
  const platformCustomerId = "eb_4afbef7f008749c3b5d87807b37710e9"
  const profile = {
    legalName: "Fruitful Africa Limited",
    email: "owner@example.com",
    country: "NG",
    createdAt: "2026-08-12T10:41:27.468649+00:00",
  }

  it("flags explicit null taxId on Grid as invalid", () => {
    expect(
      gridBusinessTaxIdIsInvalidOnGrid({
        customer: { businessInfo: { legalName: "Fruitful Africa Limited", taxId: null } },
        platformCustomerId,
        profile,
      }),
    ).toBe(true)
    expect(
      gridBusinessKybStubFieldsNeedResync({
        customer: { businessInfo: { legalName: "Fruitful Africa Limited", taxId: null } },
        platformCustomerId,
        profile,
      }),
    ).toBe(true)
  })

  it("flags historic shell taxId when org has no real tax id", () => {
    const shell = gridShellBusinessTaxId(platformCustomerId)
    expect(shell).toBe("942523714")
    expect(
      gridBusinessTaxIdIsInvalidOnGrid({
        customer: { businessInfo: { legalName: "Fruitful Africa Limited", taxId: shell } },
        platformCustomerId,
        profile: { ...profile, taxId: null },
      }),
    ).toBe(true)
  })

  it("builds a resync patch without taxId, country, or incorporatedOn for hosted KYB", () => {
    const patch = buildGridBusinessInfoResyncPatch({ platformCustomerId, profile })
    expect(patch.taxId).toBeUndefined()
    expect(patch.legalName).toBe("Fruitful Africa Limited")
    expect(patch.country).toBeUndefined()
    expect(patch.incorporatedOn).toBeUndefined()
  })

  it("builds a scrub patch that nulls taxId, country, and incorporatedOn", () => {
    const patch = buildGridBusinessInfoScrubPatch({ platformCustomerId, profile })
    expect(patch.legalName).toBe("Fruitful Africa Limited")
    expect(patch.taxId).toBeNull()
    expect(patch.country).toBeNull()
    expect(patch.incorporatedOn).toBeNull()
  })

  it("flags country/incorporation without taxId as overfilled", () => {
    expect(
      gridBusinessHostedKybBusinessInfoIsOverfilled({
        customer: {
          businessInfo: {
            legalName: "Fruitful Africa Limited",
            country: "NG",
            incorporatedOn: "2026-08-12",
          },
        },
        platformCustomerId,
        profile,
      }),
    ).toBe(true)
    expect(
      gridBusinessKybStubFieldsNeedResync({
        customer: {
          businessInfo: {
            legalName: "Fruitful Africa Limited",
            country: "NG",
            incorporatedOn: "2026-08-12",
            taxId: "942523714",
          },
        },
        platformCustomerId,
        profile: { ...profile, taxId: null },
      }),
    ).toBe(true)
  })

  it("does not flag a real stored tax id", () => {
    expect(
      gridBusinessTaxIdIsInvalidOnGrid({
        customer: { businessInfo: { legalName: "Easner Group, Inc", taxId: "320855540" } },
        platformCustomerId: "eb_4769329da17149cf86477e9b8a0128d3",
        profile: {
          legalName: "Easner Group, Inc",
          email: "owner@example.com",
          taxId: "32-0855540",
        },
      }),
    ).toBe(false)
  })
})

describe("buildGridIndividualCustomerPayload", () => {
  it("maps Noah-style profile to Grid customer", () => {
    const platformCustomerId = "ei_abc123456789012345678901234567890"
    const payload = buildGridIndividualCustomerPayload({
      platformCustomerId,
      profile: {
        fullName: "Jane Doe",
        residenceCountry: "US",
        email: "jane@example.com",
        dateOfBirth: "1990-01-01",
      },
    })
    expect(payload.platformCustomerId).toBe(platformCustomerId)
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
