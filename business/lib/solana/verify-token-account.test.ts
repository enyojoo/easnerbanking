import { describe, expect, it } from "vitest"
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { PublicKey } from "@solana/web3.js"

describe("nested ATA trap (HCQ4 owner)", () => {
  it("shows wrong deposit account when ATA pubkey is used as owner", () => {
    const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
    const vault = new PublicKey("DCjDB2euJ25aDkRyujR4bu18hz13hQDTucoBmk7AYSbx")
    const canonicalAta = getAssociatedTokenAddressSync(usdc, vault, false, TOKEN_PROGRAM_ID).toBase58()
    expect(canonicalAta).toBe("HCQ4q2Hdhu6egRHdnwHeciEQJEKvfSaEzGqrds2zWCnE")

    const wrongNested = getAssociatedTokenAddressSync(
      usdc,
      new PublicKey(canonicalAta),
      true,
      TOKEN_PROGRAM_ID,
    ).toBase58()
    expect(wrongNested).toBe("2bUDwci1YPKwF971tWLXMPuuG7kAyKJZpeoQiov4Meu9")
  })
})
