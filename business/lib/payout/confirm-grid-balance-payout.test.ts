import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/grid/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grid/config")>("@/lib/grid/config")
  return actual
})

vi.mock("@/lib/grid/payout-quote", () => ({
  buildGridBalancePayoutPreview: vi.fn(),
  buildGridLockedPayoutQuoteResult: vi.fn((input: { lockId: string; locked: { quoteId: string } }) => ({
    provider: "grid",
    lockId: input.lockId,
    quotePhase: "locked",
    grid: { quoteId: input.locked.quoteId },
  })),
  computeGridLockedBalancePayoutPricing: vi.fn(() => ({
    customerPrincipal: 1.44,
    totalDebited: 1.53,
    marginAmount: 0.007,
    processingFee: 0.014,
    channelCost: 0.015,
  })),
  fetchGridPayoutExchangeRateQuote: vi.fn(),
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
import {
  buildGridBalancePayoutPreview,
  fetchGridPayoutExchangeRateQuote,
  lockGridBalancePayoutQuote,
} from "@/lib/grid/payout-quote"
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
}

describe("confirmGridBalancePayoutOrder", () => {
  beforeEach(() => {
    vi.mocked(findReusablePayoutLockSession).mockReset()
    vi.mocked(lockGridBalancePayoutQuote).mockReset()
    vi.mocked(buildGridBalancePayoutPreview).mockReset()
    vi.mocked(fetchGridPayoutExchangeRateQuote).mockReset()
    vi.mocked(upsertPayoutLockSession).mockReset()
  })

  it("reuses a review lock without posting Grid quotes", async () => {
    vi.mocked(findReusablePayoutLockSession).mockResolvedValue({
      id: "lock-1",
      provider: "grid",
      expires_at: new Date(Date.now() + 20_000).toISOString(),
      provider_payload_json: { quoteId: "" },
    } as never)

    const result = await confirmGridBalancePayoutOrder(input)
    expect(result).toEqual({ provider: "grid", reused: true })
    expect(lockGridBalancePayoutQuote).not.toHaveBeenCalled()
    expect(fetchGridPayoutExchangeRateQuote).not.toHaveBeenCalled()
  })

  it("locks review from GET /exchange-rates and never calls POST /quotes", async () => {
    vi.mocked(findReusablePayoutLockSession).mockResolvedValue(null)
    vi.mocked(buildGridBalancePayoutPreview).mockResolvedValue({
      receiveAmount: 2000,
      receiveCurrency: "NGN",
      customerPrincipal: 1.44,
      totalDebited: 1.53,
      marginAmount: 0.007,
      processingFee: 0.014,
      channelCost: 0,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      easner: { effectiveRate: 1384.59 },
      settlement: { cryptoAuthorizedAmount: "1.44", sessionId: "grid_preview_1", customerRate: 1384.59 },
      pricingQuoteId: "grid_preview_1",
    } as never)
    vi.mocked(fetchGridPayoutExchangeRateQuote).mockResolvedValue({
      sendingUsd: 1.501175,
      feesUsd: 0.015,
      receivingAmount: 2000,
    })
    vi.mocked(upsertPayoutLockSession).mockResolvedValue({ id: "lock-2" } as never)

    await confirmGridBalancePayoutOrder(input)

    expect(lockGridBalancePayoutQuote).not.toHaveBeenCalled()
    expect(fetchGridPayoutExchangeRateQuote).toHaveBeenCalledTimes(1)
    expect(upsertPayoutLockSession).toHaveBeenCalledWith(
      input.admin,
      expect.objectContaining({
        provider: "grid",
        providerPayload: expect.objectContaining({ quoteId: "" }),
      }),
    )
  })
})
