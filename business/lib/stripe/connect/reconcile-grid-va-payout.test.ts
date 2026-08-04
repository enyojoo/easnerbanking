import { describe, expect, it, vi, beforeEach } from "vitest"
import { reconcileGridVaPayoutDestination } from "./reconcile-grid-va-payout"

const listExternalAccounts = vi.fn()
const updateExternalAccount = vi.fn()

vi.mock("../client", () => ({
  getStripe: () => ({
    accounts: {
      listExternalAccounts,
      updateExternalAccount,
    },
  }),
}))

vi.mock("./create-grid-va-external-account", () => ({
  createGridVaExternalAccountOnStripe: vi.fn(),
}))

vi.mock("./resolve-connect-account", () => ({
  getConnectAccountRow: vi.fn(),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn(),
}))

vi.mock("@/lib/noah/virtual-accounts-db", () => ({
  getVirtualAccountDisplayFromDb: vi.fn(),
}))

import { getConnectAccountRow } from "./resolve-connect-account"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { getVirtualAccountDisplayFromDb } from "@/lib/noah/virtual-accounts-db"
import { createGridVaExternalAccountOnStripe } from "./create-grid-va-external-account"

const admin = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConnectAccountRow).mockResolvedValue({
    stripe_account_id: "acct_1",
    details_submitted: true,
    stripe_external_account_id: "ba_old",
  } as never)
  vi.mocked(resolveBusinessOrgOwnerUserId).mockResolvedValue("user_1")
  vi.mocked(getVirtualAccountDisplayFromDb).mockResolvedValue({
    hasAccount: true,
    accountNumber: "1234567890",
    routingNumber: "021000021",
  } as never)
})

describe("reconcileGridVaPayoutDestination", () => {
  it("verifies when Grid VA is already the default payout bank", async () => {
    listExternalAccounts.mockResolvedValue({
      data: [
        {
          object: "bank_account",
          id: "ba_grid",
          currency: "usd",
          last4: "7890",
          routing_number: "0021",
          default_for_currency: true,
        },
      ],
    })

    const result = await reconcileGridVaPayoutDestination(admin, { businessId: "biz_1" })
    expect(result).toEqual({
      skipped: false,
      ok: true,
      action: "updated_default",
      stripeExternalAccountId: "ba_grid",
    })
    expect(updateExternalAccount).not.toHaveBeenCalled()
    expect(createGridVaExternalAccountOnStripe).not.toHaveBeenCalled()
  })

  it("promotes Grid VA bank when it exists but is not default", async () => {
    listExternalAccounts.mockResolvedValue({
      data: [
        {
          object: "bank_account",
          id: "ba_other",
          currency: "usd",
          last4: "9999",
          routing_number: "9999",
          default_for_currency: true,
        },
        {
          object: "bank_account",
          id: "ba_grid",
          currency: "usd",
          last4: "7890",
          routing_number: "0021",
          default_for_currency: false,
        },
      ],
    })
    updateExternalAccount.mockResolvedValue({})

    const result = await reconcileGridVaPayoutDestination(admin, { businessId: "biz_1" })
    expect(result).toEqual({
      skipped: false,
      ok: true,
      action: "updated_default",
      stripeExternalAccountId: "ba_grid",
    })
    expect(updateExternalAccount).toHaveBeenCalledWith("acct_1", "ba_grid", {
      default_for_currency: true,
    })
  })

  it("creates Grid VA bank when payout destination drifted away", async () => {
    listExternalAccounts.mockResolvedValue({
      data: [
        {
          object: "bank_account",
          id: "ba_other",
          currency: "usd",
          last4: "9999",
          routing_number: "9999",
          default_for_currency: true,
        },
      ],
    })
    vi.mocked(createGridVaExternalAccountOnStripe).mockResolvedValue({
      ok: true,
      stripeExternalAccountId: "ba_new",
      maskedDestination: "····7890",
      payoutInterval: "daily",
    })

    const result = await reconcileGridVaPayoutDestination(admin, { businessId: "biz_1" })
    expect(result).toEqual({
      skipped: false,
      ok: true,
      action: "linked",
      stripeExternalAccountId: "ba_new",
    })
    expect(createGridVaExternalAccountOnStripe).toHaveBeenCalled()
  })
})
