import { describe, expect, it } from "vitest"
import { isValidSolanaPublicKey } from "./address-format"

describe("isValidSolanaPublicKey", () => {
  it("accepts a known vault address", () => {
    expect(isValidSolanaPublicKey("DCjDB2euJ25aDkRyujR4bu18hz13hQDTucoBmk7AYSbx")).toBe(true)
  })

  it("rejects non-base58 strings", () => {
    expect(isValidSolanaPublicKey("not-a-valid-solana-address!!!")).toBe(false)
  })
})
