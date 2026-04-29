import { describe, expect, it } from "vitest"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"

describe("deriveStablecoinAssociatedTokenAddress", () => {
  it("matches canonical USDC ATA for a known owner", () => {
    const owner = "J8Xh2H1WLd252soocN2r3R3CbgadA5Rq9LBMvXkUyDVA"
    const ata = deriveStablecoinAssociatedTokenAddress(owner, "USDC")
    expect(ata).toBe("KE8ht4E9NEQC1v4bBoRzbBDB1yMdwxoqj6AWYkiHr8u")
  })
})
