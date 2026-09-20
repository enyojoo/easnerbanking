import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  applyDelta: vi.fn(),
  fiatPayout: vi.fn(),
  resolvePayee: vi.fn(),
  creditPlatform: vi.fn(),
}))

vi.mock("@/lib/wallet/wallet-balances-db", () => ({
  applyWalletBalanceDelta: mocks.applyDelta,
}))
vi.mock("@/lib/platform/fiat-payout", () => ({
  executePlatformFiatPayout: mocks.fiatPayout,
}))
vi.mock("@/lib/easetag-payee", () => ({
  resolveEasetagPayee: mocks.resolvePayee,
}))
vi.mock("@/lib/platform/ledger", () => ({
  creditPlatformAccountFromInbound: mocks.creditPlatform,
}))
vi.mock("@/lib/turnkey/resolve-send-client", () => ({
  resolveTurnkeySendClient: vi.fn().mockResolvedValue({ ok: false, error: "turnkey_not_configured" }),
}))
vi.mock("@/lib/turnkey/sol-spl-transfer-unsigned-tx", () => ({
  buildStablecoinSplTransferUnsignedTxPayloadForTurnkey: vi.fn(),
  getSolanaRpcUrl: () => "https://example.invalid",
}))
vi.mock("@/lib/turnkey/config", () => ({
  getTurnkeySolanaBroadcastCaip2: () => "solana:mainnet",
  isTurnkeySolSponsorshipEnabled: () => false,
}))

import { executePlatformOutboundRail, isDirectVaultWalletSend } from "./send-rails"

function createAdmin(map: Record<string, { data?: unknown }>) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {}
      for (const method of ["select", "eq", "maybeSingle"]) {
        q[method] = method === "maybeSingle" ? async () => map[table] ?? { data: null } : () => q
      }
      return q
    },
  }
}

describe("isDirectVaultWalletSend", () => {
  it("allows Solana USDC/EURC matching the vault currency", () => {
    expect(isDirectVaultWalletSend({ currency: "USD", network: "solana", asset: "USDC" })).toBe(true)
    expect(isDirectVaultWalletSend({ currency: "EUR", network: "solana", asset: "EURC" })).toBe(true)
    expect(isDirectVaultWalletSend({ currency: "USD", network: "ethereum", asset: "USDC" })).toBe(false)
    expect(isDirectVaultWalletSend({ currency: "USD", network: "solana", asset: "USDT" })).toBe(false)
  })
})

describe("executePlatformOutboundRail", () => {
  it("credits a first-party user Easetag", async () => {
    mocks.applyDelta.mockResolvedValue(undefined)
    mocks.resolvePayee.mockResolvedValue({ kind: "user", userId: "user-ada", easetag: "ada" })
    const admin = createAdmin({
      platform_destinations: { data: { id: "dest_1", type: "easetag", details: { easetag: "ada" } } },
    })
    await executePlatformOutboundRail(admin as never, {
      businessId: "biz-1",
      destinationId: "dest_1",
      amountCents: 2500,
      currency: "USD",
      walletOwnerId: "wo_1",
    })
    expect(mocks.applyDelta).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ userId: "user-ada", currency: "USD", delta: 25 }),
    )
  })

  it("credits a customer Easetag onto the issued account", async () => {
    mocks.creditPlatform.mockResolvedValue({ accountId: "acct_ada", transactionId: "txn_1" })
    mocks.resolvePayee.mockResolvedValue({
      kind: "platform_customer",
      customerId: "cus_ada",
      accountId: "acct_ada",
      easetag: "ada",
    })
    const admin = createAdmin({
      platform_destinations: { data: { id: "dest_3", type: "easetag", details: { easetag: "ada" } } },
    })
    await executePlatformOutboundRail(admin as never, {
      businessId: "biz-1",
      destinationId: "dest_3",
      amountCents: 2500,
      currency: "USD",
      walletOwnerId: "wo_1",
    })
    expect(mocks.creditPlatform).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ accountId: "acct_ada", amountCents: 2500, type: "easetag" }),
    )
  })

  it("sends live bank payout from the customer vault", async () => {
    mocks.fiatPayout.mockResolvedValue(undefined)
    const admin = createAdmin({
      platform_destinations: {
        data: { id: "dest_2", type: "bank", details: { account_number: "1", country: "US" } },
      },
    })
    await executePlatformOutboundRail(admin as never, {
      businessId: "biz-1",
      customerId: "cus_1",
      destinationId: "dest_2",
      amountCents: 2500,
      currency: "USD",
      walletOwnerId: "wo_1",
    })
    expect(mocks.fiatPayout).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        destinationType: "bank",
        customerId: "cus_1",
        walletOwnerId: "wo_1",
        amountCents: 2500,
      }),
    )
  })
})
