import { describe, expect, it } from "vitest"
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { PublicKey } from "@solana/web3.js"

describe("relay nested ATA trap (CZL3 vault)", () => {
  it("derives the nested ATA Relay funded when canonical ATA was recipient", () => {
    const usdc = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
    const vault = new PublicKey("CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC")
    const canonicalAta = getAssociatedTokenAddressSync(usdc, vault, false, TOKEN_PROGRAM_ID).toBase58()
    expect(canonicalAta).toBe("8ZieocUr7XnifU11k8K4iEh4EBXRR9YutqszvBbNGio8")

    const nestedAta = getAssociatedTokenAddressSync(
      usdc,
      new PublicKey(canonicalAta),
      true,
      TOKEN_PROGRAM_ID,
    ).toBase58()
    expect(nestedAta).toBe("2S9FGMLNjvEvm8Dt3BqcCyWU6928N1oZKbFJUwwLU7SR")
  })
})
