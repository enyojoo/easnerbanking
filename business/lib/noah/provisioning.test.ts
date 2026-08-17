import { describe, expect, it, vi, beforeEach } from "vitest"

const { fetchAllPaymentMethodsForCustomer } = vi.hoisted(() => ({
  fetchAllPaymentMethodsForCustomer: vi.fn(),
}))

vi.mock("./list-payment-methods", () => ({
  fetchAllPaymentMethodsForCustomer,
}))

vi.mock("./persist-account-data", () => ({
  persistAllPayinVirtualAccountsFromPaymentMethods: vi.fn(),
}))

vi.mock("./bank-onramp-virtual-accounts", () => ({
  ensureFiatVirtualAccountsViaBankOnramp: vi.fn(),
}))

vi.mock("./http", () => ({
  noahFetch: vi.fn(),
}))

import { provisionNoahArtifactsForCustomer } from "./provisioning"

describe("provisionNoahArtifactsForCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns skipped summary for business scope without calling Noah", async () => {
    const result = await provisionNoahArtifactsForCustomer({
      subjectUserId: "user-1",
      subjectBusinessId: "biz-1",
      noahCustomerId: "ebiz_test",
      scope: "business",
    })

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe("business_uses_grid_not_noah")
    expect(fetchAllPaymentMethodsForCustomer).not.toHaveBeenCalled()
  })
})
