import { beforeEach, describe, expect, it, vi } from "vitest"

const getWalletSendSession = vi.fn()
const lockWalletSendSession = vi.fn()

vi.mock("@/lib/payout/payout-lock-flags", () => ({
  isPayoutLockOnReviewEnabled: () => true,
}))

vi.mock("../wallet-send-session", () => ({
  getWalletSendSession: (...args: unknown[]) => getWalletSendSession(...args),
  lockWalletSendSession: (...args: unknown[]) => lockWalletSendSession(...args),
}))

import { confirmWalletSendOrder } from "../confirm-wallet-send-order"

describe("confirmWalletSendOrder quote amounts", () => {
  beforeEach(() => {
    getWalletSendSession.mockReset()
    lockWalletSendSession.mockReset()
  })

  it("sets sendAmount to receive principal for direct Turnkey, not total_debited", async () => {
    const session = {
      form_session_id: "fs-1",
      user_id: "u-1",
      receive_amount: 3,
      receive_asset: "USDC",
      receive_network: "Solana",
      source_balance_currency: "USD",
      total_debited: 3.03,
      margin_amount: 0.03,
      customer_rate: 1,
      execution_model: "direct_turnkey" as const,
      lifi_floor: 3,
      lifi_mid: 1,
      lifi_from_amount_raw: null,
      lifi_quote_id: null,
      destination_address: "Addr",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      status: "quoted" as const,
    }
    getWalletSendSession.mockResolvedValue(session)
    lockWalletSendSession.mockResolvedValue({ ...session, status: "locked" })

    const { quote } = await confirmWalletSendOrder({
      admin: {} as never,
      ctx: {} as never,
      userId: "u-1",
      formSessionId: "fs-1",
    })

    expect(quote.sendAmount).toBe(3)
    expect(quote.totalDebited).toBe(3.03)
    expect(quote.processingFee).toBe(0.03)
    expect(quote.receiveAmount).toBe(3)
  })
})
