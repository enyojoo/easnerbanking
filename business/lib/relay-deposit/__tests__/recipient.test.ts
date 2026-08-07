import { describe, expect, it } from "vitest"
import { relayDepositRecipientFromVault } from "../recipient"

describe("relayDepositRecipientFromVault", () => {
  it("returns the vault pubkey unchanged", () => {
    const vault = "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC"
    expect(relayDepositRecipientFromVault(vault)).toBe(vault)
  })

  it("rejects empty input", () => {
    expect(relayDepositRecipientFromVault("  ")).toBe("")
  })
})
