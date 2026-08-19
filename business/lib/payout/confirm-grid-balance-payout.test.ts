import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/grid/payout-quote", () => ({
  buildGridLockedPayoutQuoteResult: vi.fn((input: { lockId: string }) => ({
    provider: "grid",
    lockId: input.lockId,
  })),
  lockGridBalancePayoutQuote: vi.fn(),
}))

vi.mock("@/lib/payout/payout-lock-session", () => ({
  findReusablePayoutLockSession: vi.fn(),
  lockedQuoteFromSession: vi.fn(() => ({ provider: "grid", reused: true })),
  upsertPayoutLockSession: vi.fn(),
}))

vi.mock("@/lib/payout/payout-quote-key", () => ({
  buildPayoutQuoteKey: vi.fn(() => "quote-key"),
}))

vi.mock("@/lib/payout/recipient-snapshot-hash", () => ({
  hashRecipientSnapshot: vi.fn(() => "hash"),
}))

import { confirmGridBalancePayoutOrder } from "./confirm-grid-balance-payout"
import { lockGridBalancePayoutQuote } from "@/lib/grid/payout-quote"
import { findReusablePayoutLockSession } from "@/lib/payout/payout-lock-session"

const input = {
  admin: {} as never,
  userId: "user-1",
  businessId: null,
  recipientId: "r-1",
  recipient: { id: "r-1", currency: "NGN", country_code: "NG" } as never,
  receiveFiatAmount: 2000,
  sourceBalanceCurrency: "USD",
  senderProfile: { firstName: "A", lastName: "B" } as never,
}

describe("confirmGridBalancePayoutOrder", () => {
  beforeEach(() => {
    vi.mocked(findReusablePayoutLockSession).mockReset()
    vi.mocked(lockGridBalancePayoutQuote).mockReset()
  })

  it("reuses a Grid lock only when the quote still has more than 45s left", async () => {
    vi.mocked(findReusablePayoutLockSession).mockResolvedValue({
      id: "lock-1",
      provider: "grid",
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    } as never)

    const result = await confirmGridBalancePayoutOrder(input)
    expect(result).toEqual({ provider: "grid", reused: true })
    expect(lockGridBalancePayoutQuote).not.toHaveBeenCalled()
  })

  it("posts a new Grid quote when the reusable lock is inside the refresh buffer", async () => {
    vi.mocked(findReusablePayoutLockSession).mockResolvedValue({
      id: "lock-1",
      provider: "grid",
      expires_at: new Date(Date.now() + 20_000).toISOString(),
    } as never)
    vi.mocked(lockGridBalancePayoutQuote).mockResolvedValue({
      quoteId: "Quote:new",
      sequenceId: "grid_quote_Quote:new",
      customerId: "Customer:c1",
      externalAccountId: "ExternalAccount:e1",
      cryptoAmount: 1.501175,
      fundingAddress: "So1anaFunding111",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      receiveAmount: 2000,
      receiveCurrency: "NGN",
      pricing: {
        customerPrincipal: 1.444472,
        totalDebited: 1.53,
        marginAmount: 0.007,
        processingFee: 0.014445,
        channelCost: 0.015,
        customerRate: 1384.59,
      },
    } as never)

    const { upsertPayoutLockSession } = await import("@/lib/payout/payout-lock-session")
    vi.mocked(upsertPayoutLockSession).mockResolvedValue({ id: "lock-2" } as never)

    await confirmGridBalancePayoutOrder(input)
    expect(lockGridBalancePayoutQuote).toHaveBeenCalledTimes(1)
  })
})
