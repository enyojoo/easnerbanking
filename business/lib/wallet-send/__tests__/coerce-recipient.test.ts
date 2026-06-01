import { describe, expect, it } from "vitest"
import { coerceWalletRecipientRow } from "../coerce-recipient"
import { validateWalletRecipientForSend } from "../validate-recipient"

describe("coerceWalletRecipientRow", () => {
  it("infers asset and network from Wallet (ASSET/Network) bank_name", () => {
    const row = coerceWalletRecipientRow({
      id: "r1",
      user_id: "u1",
      account_number: "0xabc",
      currency: "USD",
      bank_name: "Wallet (USDC/Solana)",
      wallet_network: null,
    })
    expect(row.currency).toBe("USDC")
    expect(row.wallet_network).toBe("Solana")
    const gate = validateWalletRecipientForSend(row)
    expect(gate.ok).toBe(true)
  })

  it("keeps explicit wallet_network when present", () => {
    const row = coerceWalletRecipientRow({
      id: "r1",
      user_id: "u1",
      account_number: "addr",
      currency: "USDT",
      bank_name: "Wallet (USDT/Tron)",
      wallet_network: "Tron",
    })
    expect(row.wallet_network).toBe("Tron")
  })
})
