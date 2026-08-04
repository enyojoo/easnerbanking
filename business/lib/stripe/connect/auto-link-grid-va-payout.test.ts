import { describe, expect, it, vi, beforeEach } from "vitest"
import { autoLinkGridVaPayoutIfEligible } from "./auto-link-grid-va-payout"

vi.mock("./resolve-connect-account", () => ({
  getConnectAccountRow: vi.fn(),
}))

vi.mock("@/lib/business/org-owner", () => ({
  resolveBusinessOrgOwnerUserId: vi.fn(),
}))

vi.mock("@/lib/noah/virtual-accounts-db", () => ({
  hasActiveVirtualAccountInDb: vi.fn(),
}))

vi.mock("./link-grid-va-external-account", () => ({
  linkGridVaExternalAccount: vi.fn(),
}))

import { getConnectAccountRow } from "./resolve-connect-account"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { hasActiveVirtualAccountInDb } from "@/lib/noah/virtual-accounts-db"
import { linkGridVaExternalAccount } from "./link-grid-va-external-account"

const admin = {} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe("autoLinkGridVaPayoutIfEligible", () => {
  it("skips when payout is already linked", async () => {
    vi.mocked(getConnectAccountRow).mockResolvedValue({
      stripe_account_id: "acct_1",
      stripe_external_account_id: "ba_1",
      details_submitted: true,
    } as never)

    const result = await autoLinkGridVaPayoutIfEligible(admin, { businessId: "biz_1" })
    expect(result).toEqual({ skipped: true, reason: "already_linked" })
    expect(linkGridVaExternalAccount).not.toHaveBeenCalled()
  })

  it("skips before Stripe details are submitted", async () => {
    vi.mocked(getConnectAccountRow).mockResolvedValue({
      stripe_account_id: "acct_1",
      stripe_external_account_id: null,
      details_submitted: false,
    } as never)

    const result = await autoLinkGridVaPayoutIfEligible(admin, { businessId: "biz_1" })
    expect(result).toEqual({ skipped: true, reason: "details_not_submitted" })
  })

  it("links Grid VA after details are submitted", async () => {
    vi.mocked(getConnectAccountRow).mockResolvedValue({
      stripe_account_id: "acct_1",
      stripe_external_account_id: null,
      details_submitted: true,
    } as never)
    vi.mocked(resolveBusinessOrgOwnerUserId).mockResolvedValue("user_1")
    vi.mocked(hasActiveVirtualAccountInDb).mockResolvedValue(true)
    vi.mocked(linkGridVaExternalAccount).mockResolvedValue({
      ok: true,
      stripeExternalAccountId: "ba_new",
      currency: "USD",
      maskedDestination: "····1234",
      payoutInterval: "daily",
    })

    const result = await autoLinkGridVaPayoutIfEligible(admin, { businessId: "biz_1" })
    expect(result).toEqual({
      skipped: false,
      ok: true,
      stripeExternalAccountId: "ba_new",
      maskedDestination: "····1234",
    })
    expect(linkGridVaExternalAccount).toHaveBeenCalledWith(admin, {
      businessId: "biz_1",
      currency: "USD",
    })
  })
})
