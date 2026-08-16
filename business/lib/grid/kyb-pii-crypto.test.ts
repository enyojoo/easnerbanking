import { describe, expect, it } from "vitest"
import { decryptKybPii, encryptKybPii } from "./kyb-pii-crypto"

describe("kyb pii crypto", () => {
  it("round-trips an identifier", () => {
    process.env.KYB_PII_ENCRYPTION_KEY = "test-kyb-key"
    const { ciphertext, keyId } = encryptKybPii("123-45-6789")
    expect(keyId).toBe("kyb-pii-v1")
    expect(ciphertext).toBeTruthy()
    expect(decryptKybPii(ciphertext)).toBe("123-45-6789")
  })
})
