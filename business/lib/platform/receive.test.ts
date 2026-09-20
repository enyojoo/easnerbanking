import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dispatchWebhook: vi.fn(),
  createKyc: vi.fn(),
  depositAddrs: vi.fn(),
  createVa: vi.fn(),
  createHostedSession: vi.fn(),
  retrieveSession: vi.fn(),
}))

vi.mock("@/lib/checkout/merchant-webhooks", () => ({
  dispatchMerchantWebhook: mocks.dispatchWebhook,
}))
vi.mock("@/lib/bridge/kyc-links", () => ({
  createBridgeKycLink: mocks.createKyc,
  bridgeCreateKycLinkIdempotencyKey: () => "kyc-key",
  resolveBridgeCustomerKycStatus: () => "pending",
}))
vi.mock("@/lib/wallet/turnkey-deposit-addresses", () => ({
  getTurnkeyDepositAddressesForWalletOwner: mocks.depositAddrs,
}))
vi.mock("@/lib/bridge/virtual-accounts", () => ({
  createBridgeVirtualAccountForVault: mocks.createVa,
}))
vi.mock("@/lib/business-app-public-url", () => ({
  getBusinessAppPublicOrigin: () => "https://business.easner.com",
}))
vi.mock("@/lib/stripe/onramp-client", () => ({
  stripeOnramp: {
    createHostedSession: mocks.createHostedSession,
    retrieveSession: mocks.retrieveSession,
  },
}))
vi.mock("@/lib/stripe/config", () => ({
  getStripePublishableKey: () => "pk_live_test",
}))
vi.mock("@/lib/platform/wallet-owner", () => ({
  provisionPlatformCustomerVaults: vi.fn().mockResolvedValue(undefined),
}))

import {
  completePlatformOnrampSession,
  createPlatformOnrampSession,
  getDepositAddresses,
  getDepositInstructions,
  mapProviderStatusToVerification,
  sandboxBankInstructions,
  setPlatformCustomerVerification,
  startPlatformCustomerVerification,
} from "./receive"
import { creditPlatformAccountFromInbound } from "./ledger"

function createAdmin(map: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const idx: Record<string, number> = {}
  return {
    from(table: string) {
      const q: Record<string, unknown> = {}
      const finish = async () => {
        const list = map[table] ?? [{ data: null }]
        const i = idx[table] ?? 0
        idx[table] = i + 1
        return list[Math.min(i, list.length - 1)]
      }
      for (const method of ["select", "eq", "not", "contains", "filter", "order", "limit", "insert", "update", "upsert"]) {
        q[method] = () => q
      }
      q.maybeSingle = finish
      q.single = finish
      return q
    },
  }
}

const customer = {
  id: "cus_1",
  business_id: "biz-1",
  livemode: false,
  email: "ada@example.com",
  name: "Ada",
  external_id: "user_42",
  status: "active",
  verification_status: "unverified",
  metadata: {},
  wallet_owner_id: "wo_1",
  created_at: "2026-09-20T00:00:00.000Z",
}

const issuedAccount = {
  id: "acct_1",
  business_id: "biz-1",
  livemode: false,
  currency: "USD",
  customer_id: "cus_1",
  wallet_owner_id: "wo_1",
}

describe("mapProviderStatusToVerification", () => {
  it("maps partner statuses onto the public enum", () => {
    expect(mapProviderStatusToVerification("approved")).toBe("approved")
    expect(mapProviderStatusToVerification("denied")).toBe("rejected")
    expect(mapProviderStatusToVerification("in_review")).toBe("pending")
    expect(mapProviderStatusToVerification(null)).toBe("unverified")
  })
})

describe("sandboxBankInstructions", () => {
  it("returns USD and EUR test details", () => {
    expect(sandboxBankInstructions({ currency: "usd", accountHolder: "Ada" })).toMatchObject({
      type: "bank",
      currency: "USD",
      account_number: "000123456789",
      routing_number: "110000000",
    })
    expect(sandboxBankInstructions({ currency: "EUR", accountHolder: "Ada" })).toMatchObject({
      currency: "EUR",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
    })
  })
})

describe("startPlatformCustomerVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dispatchWebhook.mockResolvedValue(undefined)
  })

  it("approves test customers without a hosted link", async () => {
    const admin = createAdmin({
      platform_customers: [
        { data: customer },
        { data: customer },
        { data: { ...customer, verification_status: "approved" } },
      ],
    })
    const result = await startPlatformCustomerVerification(admin as never, {
      businessId: "biz-1",
      livemode: false,
      customerId: "cus_1",
    })
    expect(result).toEqual({ status: "approved", url: null })
    expect(mocks.dispatchWebhook).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        event: "customer.updated",
        data: expect.objectContaining({ id: "cus_1", verification_status: "approved" }),
      }),
    )
    expect(mocks.createKyc).not.toHaveBeenCalled()
  })

  it("returns a hosted link in live when the customer is not approved", async () => {
    mocks.createKyc.mockResolvedValue({
      id: "kyc_1",
      customer_id: "bridge_cus",
      kyc_link: "https://verify.example/kyc",
    })
    const liveCustomer = { ...customer, livemode: true }
    const admin = createAdmin({
      platform_customers: [
        { data: liveCustomer },
        { data: liveCustomer },
        { data: { ...liveCustomer, verification_status: "pending" } },
      ],
    })
    const result = await startPlatformCustomerVerification(admin as never, {
      businessId: "biz-1",
      livemode: true,
      customerId: "cus_1",
      returnUrl: "https://app.example/done",
    })
    expect(result).toEqual({ status: "pending", url: "https://verify.example/kyc" })
    expect(mocks.createKyc).toHaveBeenCalled()
  })
})

describe("setPlatformCustomerVerification", () => {
  it("does not emit customer.updated when status is unchanged", async () => {
    mocks.dispatchWebhook.mockClear()
    const admin = createAdmin({
      platform_customers: [
        { data: { ...customer, verification_status: "approved" } },
        { data: { ...customer, verification_status: "approved" } },
      ],
    })
    await setPlatformCustomerVerification(admin as never, { customerId: "cus_1", status: "approved" })
    expect(mocks.dispatchWebhook).not.toHaveBeenCalled()
  })
})

describe("getDepositInstructions", () => {
  it("returns sandbox bank details in test", async () => {
    const admin = createAdmin({
      platform_accounts: [{ data: issuedAccount }],
      platform_customers: [{ data: customer }],
    })
    const details = await getDepositInstructions(admin as never, {
      businessId: "biz-1",
      livemode: false,
      accountId: "acct_1",
    })
    expect(details).toMatchObject({
      type: "bank",
      currency: "USD",
      account_number: "000123456789",
    })
  })

  it("requires verification in live", async () => {
    const admin = createAdmin({
      platform_accounts: [{ data: { ...issuedAccount, livemode: true } }],
      platform_customers: [{ data: { ...customer, livemode: true, verification_status: "unverified" } }],
    })
    await expect(
      getDepositInstructions(admin as never, {
        businessId: "biz-1",
        livemode: true,
        accountId: "acct_1",
      }),
    ).rejects.toMatchObject({ code: "verification_required" })
  })
})

describe("getDepositAddresses", () => {
  beforeEach(() => {
    mocks.depositAddrs.mockResolvedValue({
      USD: { address: "So111", ownerAddress: "So111", chain: "solana", stablecoin: "USDC" },
      EUR: { address: "", ownerAddress: "", chain: "solana", stablecoin: "EURC" },
    })
  })

  it("returns the issued account address in test", async () => {
    const admin = createAdmin({
      platform_accounts: [{ data: issuedAccount }],
      platform_customers: [{ data: customer }],
    })
    await expect(
      getDepositAddresses(admin as never, {
        businessId: "biz-1",
        livemode: false,
        accountId: "acct_1",
      }),
    ).resolves.toEqual([
      { currency: "USD", network: "solana", address: "So111", asset: "USDC" },
    ])
  })

  it("requires verification in live", async () => {
    const admin = createAdmin({
      platform_accounts: [{ data: { ...issuedAccount, livemode: true } }],
      platform_customers: [{ data: { ...customer, livemode: true } }],
    })
    await expect(
      getDepositAddresses(admin as never, {
        businessId: "biz-1",
        livemode: true,
        accountId: "acct_1",
      }),
    ).rejects.toMatchObject({ code: "verification_required" })
  })
})

describe("onramp sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a hosted session URL", async () => {
    const admin = createAdmin({
      platform_accounts: [{ data: issuedAccount }],
      platform_customers: [{ data: { ...customer, verification_status: "approved" } }],
      platform_onramp_sessions: [
        { data: { id: "ors_1", status: "open", amount_cents: 2500, currency: "USD", livemode: false, return_url: null } },
      ],
    })
    const session = await createPlatformOnrampSession(admin as never, {
      businessId: "biz-1",
      livemode: false,
      accountId: "acct_1",
      amountCents: 2500,
    })
    expect(session).toMatchObject({
      id: "ors_1",
      amount: 2500,
      url: "https://business.easner.com/receive/onramp/ors_1",
    })
  })

  it("completes a test session onto the issued account", async () => {
    const admin = createAdmin({
      platform_onramp_sessions: [
        {
          data: {
            id: "ors_1",
            account_id: "acct_1",
            amount_cents: 2500,
            currency: "USD",
            status: "open",
            livemode: false,
            return_url: "https://app.example/done",
          },
        },
      ],
      platform_transactions: [{ data: null }, { data: { id: "txn_onramp" } }],
      platform_accounts: [
        {
          data: {
            id: "acct_1",
            business_id: "biz-1",
            livemode: false,
            currency: "USD",
            available_cents: 0,
            pending_cents: 0,
            customer_id: "cus_1",
          },
        },
        {
          data: {
            id: "acct_1",
            business_id: "biz-1",
            livemode: false,
            currency: "USD",
            available_cents: 2500,
            pending_cents: 0,
            customer_id: "cus_1",
          },
        },
      ],
    })
    await expect(completePlatformOnrampSession(admin as never, "ors_1")).resolves.toEqual({
      status: "completed",
      return_url: "https://app.example/done",
    })
  })

  it("creates a live hosted card session onto the vault", async () => {
    mocks.depositAddrs.mockResolvedValue({
      USD: { address: "So111", ownerAddress: "So111", chain: "solana", stablecoin: "USDC" },
      EUR: { address: "", ownerAddress: "", chain: "solana", stablecoin: "EURC" },
    })
    mocks.createHostedSession.mockResolvedValue({
      id: "cos_live",
      client_secret: "cos_live_secret",
    })
    const admin = createAdmin({
      platform_accounts: [{ data: { ...issuedAccount, livemode: true } }],
      platform_customers: [{ data: { ...customer, livemode: true, verification_status: "approved" } }],
      platform_onramp_sessions: [
        { data: { id: "ors_live", status: "open", amount_cents: 2500, currency: "USD", livemode: true, return_url: null } },
      ],
    })
    const session = await createPlatformOnrampSession(admin as never, {
      businessId: "biz-1",
      livemode: true,
      accountId: "acct_1",
      amountCents: 2500,
    })
    expect(mocks.createHostedSession).toHaveBeenCalled()
    expect(session).toMatchObject({
      id: "ors_live",
      livemode: true,
      url: "https://business.easner.com/receive/onramp/ors_live",
    })
  })

  it("completes a fulfilled live session onto the issued account", async () => {
    mocks.retrieveSession.mockResolvedValue({ id: "cos_live", status: "fulfillment_complete" })
    const admin = createAdmin({
      platform_onramp_sessions: [
        {
          data: {
            id: "ors_live",
            account_id: "acct_1",
            amount_cents: 2500,
            currency: "USD",
            status: "open",
            livemode: true,
            return_url: "https://app.example/done",
            stripe_session_id: "cos_live",
          },
        },
      ],
      platform_transactions: [{ data: null }, { data: { id: "txn_onramp_live" } }],
      platform_accounts: [
        {
          data: {
            id: "acct_1",
            business_id: "biz-1",
            livemode: true,
            currency: "USD",
            available_cents: 0,
            pending_cents: 0,
            customer_id: "cus_1",
          },
        },
        {
          data: {
            id: "acct_1",
            business_id: "biz-1",
            livemode: true,
            currency: "USD",
            available_cents: 2500,
            pending_cents: 0,
            customer_id: "cus_1",
          },
        },
      ],
    })
    await expect(completePlatformOnrampSession(admin as never, "ors_live")).resolves.toEqual({
      status: "completed",
      return_url: "https://app.example/done",
    })
  })
})

describe("creditPlatformAccountFromInbound", () => {
  it("is idempotent on inbound_key", async () => {
    const admin = createAdmin({
      platform_transactions: [{ data: { id: "txn_existing", account_id: "acct_1" } }],
    })
    await expect(
      creditPlatformAccountFromInbound(admin as never, {
        accountId: "acct_1",
        amountCents: 100,
        type: "deposit",
        inboundKey: "deposit:abc",
      }),
    ).resolves.toEqual({ accountId: "acct_1", transactionId: "txn_existing" })
  })
})
