import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { buildTurnkeyUsdcExternalAccountPayload } from "./turnkey-external-account"

describe("buildTurnkeyUsdcExternalAccountPayload", () => {
  it("registers the vault pubkey as first-party Solana USDC", () => {
    expect(
      buildTurnkeyUsdcExternalAccountPayload({
        platformAccountId: "turnkey_sol_usdc_biz-1",
        gridCustomerId: "Customer:abc",
        solanaAddress: "VaultPubkey111",
      }),
    ).toEqual({
      customerId: "Customer:abc",
      currency: "USDC",
      platformAccountId: "turnkey_sol_usdc_biz-1",
      ownershipType: "FIRST_PARTY",
      accountInfo: {
        accountType: "SOLANA_WALLET",
        assetType: "USDC",
        address: "VaultPubkey111",
      },
    })
  })
})
