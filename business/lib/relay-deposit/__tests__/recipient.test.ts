import { describe, expect, it } from "vitest"
import {
  needsRelayDepositRecipientReprovision,
  relayDepositRecipientFromVault,
} from "../recipient"

describe("relayDepositRecipientFromVault", () => {
  it("returns the vault pubkey unchanged", () => {
    const vault = "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC"
    expect(relayDepositRecipientFromVault(vault)).toBe(vault)
  })

  it("rejects empty input", () => {
    expect(relayDepositRecipientFromVault("  ")).toBe("")
  })
})

describe("needsRelayDepositRecipientReprovision", () => {
  const vault = "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC"
  const ata = "8ZieocUr7XnifU11k8K4iEh4EBXRR9YutqszvBbNGio8"

  it("returns false when stored recipient is the vault pubkey", () => {
    expect(needsRelayDepositRecipientReprovision(vault, vault)).toBe(false)
  })

  it("returns true when stored recipient is the legacy SPL ATA", () => {
    expect(needsRelayDepositRecipientReprovision(ata, vault)).toBe(true)
  })

  it("returns true when stored recipient is empty", () => {
    expect(needsRelayDepositRecipientReprovision("", vault)).toBe(true)
  })
})
