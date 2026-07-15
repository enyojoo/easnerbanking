import { describe, expect, it } from "vitest"
import {
  parseNoahAssociateForUsers,
  parseNoahBusinessPersonForOwnerUsers,
  pickNoahBusinessRepresentative,
} from "./parse-noah-associate-for-users"

describe("pickNoahBusinessRepresentative", () => {
  it("prefers email match", () => {
    const rep = pickNoahBusinessRepresentative(
      {
        Associates: [
          {
            Email: "other@x.com",
            RelationshipTypes: ["UBO"],
            OwnershipPercentage: 60,
            Identities: [{ IDType: "TaxID", IDNumber: "11111111111" }],
          },
          {
            Email: "owner@x.com",
            RelationshipTypes: ["Representative"],
            Identities: [{ IDType: "NationalID", IDNumber: "22222222222" }],
          },
        ],
      },
      { ownerEmail: "owner@x.com" },
    )
    expect(rep?.Email).toBe("owner@x.com")
  })

  it("falls back to highest UBO", () => {
    const rep = pickNoahBusinessRepresentative({
      Associates: [
        { RelationshipTypes: ["UBO"], OwnershipPercentage: 10, FullName: "A" },
        { RelationshipTypes: ["UBO"], OwnershipPercentage: 80, FullName: "B" },
      ],
    })
    expect(rep?.FullName).toBe("B")
  })
})

describe("parseNoahBusinessPersonForOwnerUsers", () => {
  it("uses Associates when top-level has no Identities", () => {
    const parsed = parseNoahBusinessPersonForOwnerUsers({
      RegisteredName: "Acme NG Ltd",
      Associates: [
        {
          FullName: "Ada Obi",
          RelationshipTypes: ["Representative"],
          Identities: [{ IDType: "NationalIDCard", IDNumber: "12345678901" }],
          PrimaryResidence: { Country: "NG", City: "Lagos" },
        },
      ],
    })
    expect(parsed.full_name).toContain("Ada")
    expect(parsed.kyc_id_type).toBe("NationalIDCard")
    expect(parsed.kyc_id_number).toBe("12345678901")
  })

  it("parseNoahAssociateForUsers mirrors individual parser", () => {
    const parsed = parseNoahAssociateForUsers({
      FullName: "Chidi Okeke",
      Identities: [{ IDType: "TaxID", IDNumber: "10987654321" }],
    })
    expect(parsed.kyc_id_type).toBe("TaxID")
  })
})
