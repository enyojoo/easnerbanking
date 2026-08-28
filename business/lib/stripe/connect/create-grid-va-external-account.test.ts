import { beforeEach, describe, expect, it, vi } from "vitest"
import { createGridVaExternalAccountOnStripe } from "./create-grid-va-external-account"

const createExternalAccount = vi.fn()
const listExternalAccounts = vi.fn()

vi.mock("../client", () => ({
  getStripe: () => ({
    accounts: {
      createExternalAccount,
      listExternalAccounts,
    },
  }),
}))

vi.mock("./configure-payout-schedule", () => ({
  configureConnectedAccountPayoutSchedule: vi.fn(async () => ({ interval: "daily" })),
}))

vi.mock("./sync-account-from-stripe", () => ({
  syncConnectAccountRow: vi.fn(async () => ({})),
}))

const admin = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
} as never

const va = {
  hasAccount: true,
  accountNumber: "1234567890",
  routingNumber: "021214891",
  accountHolderName: "Acme",
} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createGridVaExternalAccountOnStripe", () => {
  it("sends a deterministic idempotency key", async () => {
    createExternalAccount.mockResolvedValue({ id: "ba_new" })
    await createGridVaExternalAccountOnStripe(admin, {
      businessId: "biz_1",
      stripeAccountId: "acct_1",
      currency: "USD",
      va,
    })
    expect(createExternalAccount).toHaveBeenCalledWith(
      "acct_1",
      expect.objectContaining({ default_for_currency: true }),
      { idempotencyKey: "connect_va_biz_1_usd_usd_1234567890_021214891" },
    )
  })

  it("reuses the existing Stripe bank when create reports a duplicate", async () => {
    createExternalAccount.mockRejectedValue({
      code: "bank_account_exists",
      message: "This bank account already exists",
    })
    listExternalAccounts.mockResolvedValue({
      data: [
        {
          object: "bank_account",
          id: "ba_existing",
          currency: "usd",
          last4: "7890",
          routing_number: "021214891",
          default_for_currency: true,
        },
      ],
    })

    const result = await createGridVaExternalAccountOnStripe(admin, {
      businessId: "biz_1",
      stripeAccountId: "acct_1",
      currency: "USD",
      va,
    })
    expect(result).toEqual({
      ok: true,
      stripeExternalAccountId: "ba_existing",
      maskedDestination: "····7890",
      payoutInterval: "daily",
    })
    expect(createExternalAccount).toHaveBeenCalledTimes(1)
  })
})
