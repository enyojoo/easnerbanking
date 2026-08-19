import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/grid/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grid/config")>("@/lib/grid/config")
  return actual
})

vi.mock("@/lib/grid/payout-quote", () => ({
  buildGridLockedPayoutQuoteResult: vi.fn((input: { lockId: string; locked: { quoteId: string } }) => ({
    provider: "grid",
    lockId: input.lockId,
    quotePhase: "locked",
    grid: { quoteId: input.locked.quoteId },
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
import {
  findReusablePayoutLockSession,
  upsertPayoutLockSession,
} from "@/lib/payout/payout-lock-session"

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

const liveLock = {
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
}

describe("confirmGridBalancePayoutOrder", () => {
  beforeEach(() => {
    vi.mocked(findReusablePayoutLockSession).mockReset()
    vi.mocked(lockGridBalancePayoutQuote).mockReset()
    vi.mocked(upsertPayoutLockSession).mockReset()
  })

  it("reuses a live Grid quote only when it still has more than 45s left", async () => {
    vi.mocked(findReusablePayoutLockSession).mockResolvedValue({
      id: "lock-1",
      provider: "grid",
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      provider_payload_json: {
        quoteId: "Quote:live",
        fundingAddress: "So1anaFunding111",
      },
    } as never)

    const result = await confirmGridBalancePayoutOrder(input)
    expect(result).toEqual({ provider: "grid", reused: true })
    expect(lockGridBalancePayoutQuote).not.toHaveBeenCalled()
  })

  it("does not reuse a DB-only lock without a live Grid quoteId", async () => {
    vi.mocked(findReusablePayoutLockSession).mockResolvedValue({
      id: "lock-1",
      provider: "grid",
      expires_at: new Date(Date.now() + 120_000).toISOString(),
      provider_payload_json: { quoteId: "", fundingAddress: "" },
    } as never)
    vi.mocked(lockGridBalancePayoutQuote).mockResolvedValue(liveLock as never)
    vi.mocked(upsertPayoutLockSession).mockResolvedValue({ id: "lock-2" } as never)

    await confirmGridBalancePayoutOrder(input)
    expect(lockGridBalancePayoutQuote).toHaveBeenCalledTimes(1)
  })

  it("posts a new Grid quote when the reusable lock is inside the refresh buffer", async () => {
    vi.mocked(findReusablePayoutLockSession).mockResolvedValue({
      id: "lock-1",
      provider: "grid",
      expires_at: new Date(Date.now() + 20_000).toISOString(),
      provider_payload_json: {
        quoteId: "Quote:old",
        fundingAddress: "So1anaFunding111",
      },
    } as never)
    vi.mocked(lockGridBalancePayoutQuote).mockResolvedValue(liveLock as never)
    vi.mocked(upsertPayoutLockSession).mockResolvedValue({ id: "lock-2" } as never)

    await confirmGridBalancePayoutOrder(input)
    expect(lockGridBalancePayoutQuote).toHaveBeenCalledTimes(1)
  })
})
