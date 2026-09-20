import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureEa: vi.fn(),
  createOfframp: vi.fn(),
  depositAddr: vi.fn(),
  sendVault: vi.fn(),
  selectProvider: vi.fn(),
}))

vi.mock("@/lib/bridge/external-accounts", () => ({
  ensureBridgeExternalAccount: mocks.ensureEa,
}))
vi.mock("@/lib/bridge/transfers", () => ({
  createBridgeOfframpTransfer: mocks.createOfframp,
  bridgeTransferDepositAddress: () => "Bridge111",
}))
vi.mock("@/lib/platform/vault-send", () => ({
  sendStablecoinFromWalletOwner: mocks.sendVault,
}))
vi.mock("@/lib/payout-providers", () => ({
  selectProviderForCorridor: mocks.selectProvider,
}))
vi.mock("@/lib/wallet/turnkey-deposit-addresses", () => ({
  getTurnkeyDepositAddressesForWalletOwner: mocks.depositAddr,
}))
vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn(),
}))
vi.mock("@/lib/yellowcard/payout-quote", () => ({
  lockYcBalancePayoutSend: vi.fn(),
}))
vi.mock("@/lib/grid/payout-quote", () => ({
  lockGridBalancePayoutQuote: vi.fn(),
}))

import { destinationToRecipientRow, executePlatformFiatPayout } from "./fiat-payout"

function createAdmin(map: Record<string, { data?: unknown }>) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {}
      for (const method of ["select", "eq", "update", "maybeSingle"]) {
        q[method] = method === "maybeSingle" ? async () => map[table] ?? { data: null } : () => q
      }
      return q
    },
  }
}

describe("destinationToRecipientRow", () => {
  it("maps bank and mobile-money details", () => {
    expect(
      destinationToRecipientRow({
        type: "bank",
        currency: "USD",
        details: {
          account_number: "123",
          routing_number: "021000021",
          account_holder: "Ada",
          country: "US",
          checking_or_savings: "checking",
        },
      }),
    ).toMatchObject({
      full_name: "Ada",
      account_number: "123",
      routing_number: "021000021",
      country_code: "US",
      currency: "USD",
    })
    expect(
      destinationToRecipientRow({
        type: "mobile_money",
        currency: "USD",
        details: { phone: "+2547", network: "mpesa", country: "KE", currency: "KES" },
      }),
    ).toMatchObject({
      bank_name: "Mobile Money",
      phone_number: "+2547",
      mobile_provider: "mpesa",
      country_code: "KE",
      currency: "KES",
    })
  })
})

describe("executePlatformFiatPayout", () => {
  it("offramps US bank from the customer vault", async () => {
    mocks.ensureEa.mockResolvedValue("ea_1")
    mocks.createOfframp.mockResolvedValue({ id: "xfer_1" })
    mocks.sendVault.mockResolvedValue(undefined)
    const admin = createAdmin({
      platform_customers: {
        data: {
          id: "cus_1",
          verification_status: "approved",
          metadata: { bridge_customer_id: "bc_1" },
        },
      },
    })
    await executePlatformFiatPayout(admin as never, {
      businessId: "biz-1",
      customerId: "cus_1",
      destinationId: "dest_1",
      destinationType: "bank",
      details: { account_number: "123", routing_number: "021000021", country: "US", account_holder: "Ada" },
      amountCents: 2500,
      currency: "USD",
      walletOwnerId: "wo_1",
    })
    expect(mocks.ensureEa).toHaveBeenCalled()
    expect(mocks.createOfframp).toHaveBeenCalled()
    expect(mocks.sendVault).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        walletOwnerId: "wo_1",
        asset: "USDC",
        destinationAddress: "Bridge111",
        amount: 25,
      }),
    )
  })

  it("requires verification", async () => {
    const admin = createAdmin({
      platform_customers: { data: { id: "cus_1", verification_status: "unverified", metadata: {} } },
    })
    await expect(
      executePlatformFiatPayout(admin as never, {
        businessId: "biz-1",
        customerId: "cus_1",
        destinationId: "dest_1",
        destinationType: "bank",
        details: { country: "US", account_number: "1" },
        amountCents: 2500,
        currency: "USD",
        walletOwnerId: "wo_1",
      }),
    ).rejects.toMatchObject({ code: "verification_required" })
  })
})
