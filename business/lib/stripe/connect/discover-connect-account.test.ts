import { describe, expect, it, vi, beforeEach } from "vitest"
import { discoverStripeConnectAccountId } from "./discover-connect-account"

const accountsList = vi.fn()
const accountsSearch = vi.fn()

vi.mock("../client", () => ({
  getStripe: () => ({
    accounts: { list: accountsList, search: accountsSearch },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.STRIPE_CONNECT_ACCOUNT_BY_BUSINESS_ID
  accountsSearch.mockResolvedValue({ data: [] })
  accountsList.mockResolvedValue({ data: [], has_more: false })
})

describe("discoverStripeConnectAccountId", () => {
  it("uses sandbox business map when configured", async () => {
    process.env.STRIPE_CONNECT_ACCOUNT_BY_BUSINESS_ID = JSON.stringify({
      "4769329d-a171-49cf-8647-7e9b8a0128d3": "acct_sandbox",
    })
    const id = await discoverStripeConnectAccountId("4769329d-a171-49cf-8647-7e9b8a0128d3")
    expect(id).toBe("acct_sandbox")
    expect(accountsSearch).not.toHaveBeenCalled()
  })

  it("finds account via Stripe search by metadata", async () => {
    accountsSearch.mockResolvedValue({
      data: [{ id: "acct_match", metadata: { easner_business_id: "biz_2" } }],
    })
    const id = await discoverStripeConnectAccountId("biz_2")
    expect(id).toBe("acct_match")
    expect(accountsList).not.toHaveBeenCalled()
  })

  it("falls back to accounts.list when search returns nothing", async () => {
    accountsList.mockResolvedValue({
      data: [{ id: "acct_list", metadata: { easner_business_id: "biz_3" } }],
      has_more: false,
    })
    const id = await discoverStripeConnectAccountId("biz_3")
    expect(id).toBe("acct_list")
  })
})
