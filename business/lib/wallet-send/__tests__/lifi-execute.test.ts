import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/lifi/client", () => ({
  lifiQuote: vi.fn(),
  lifiGetStatus: vi.fn(),
}))

vi.mock("@/lib/turnkey/client", () => ({
  getTurnkeyApiClientForSubOrganization: vi.fn(),
}))

vi.mock("@/lib/turnkey/config", () => ({
  getTurnkeySolanaBroadcastCaip2: () => "solana:101",
  isTurnkeySolSponsorshipEnabled: () => true,
}))

vi.mock("@/lib/turnkey/send", () => ({
  createTurnkeySend: vi.fn(),
}))

vi.mock("@/lib/wallet/resolve-wallet-owner", () => ({
  resolveTurnkeyAddressForNoahPair: vi.fn(),
  resolveWalletOwnerIdForEasnerContext: vi.fn().mockResolvedValue("owner-1"),
}))

import { lifiQuote } from "@/lib/lifi/client"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { executeLifiWalletSend } from "../lifi-execute"

const admin = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { turnkey_sub_organization_id: "sub-org" },
          error: null,
        }),
      }),
    }),
  }),
} as never

const session = {
  form_session_id: "sess-1",
  user_id: "user-1",
  recipient_id: "rec-1",
  source_balance_currency: "USD",
  receive_asset: "USDT",
  receive_network: "Tron",
  destination_address: "dest-tron",
  receive_amount: 10,
  customer_rate: 0.96,
  lifi_mid: 0.98,
  lifi_floor: 10.5,
  total_debited: 12,
  margin_amount: 0,
  execution_model: "lifi_bridge" as const,
  status: "quoted",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
}

describe("executeLifiWalletSend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveTurnkeyAddressForNoahPair).mockResolvedValue("vault-sol")
    vi.mocked(createTurnkeySend).mockResolvedValue({
      status: "settled",
      providerTransactionId: "tk-margin",
    })
    vi.mocked(getTurnkeyApiClientForSubOrganization).mockReturnValue({
      solSendTransaction: vi.fn().mockResolvedValue({
        sendTransactionStatusId: "tk-1",
        signature: "sig-1",
      }),
    } as never)
    vi.mocked(lifiQuote).mockResolvedValue({
      id: "q-exec",
      tool: "relay",
      estimate: {
        fromAmount: "10500000",
        toAmount: "10000000",
      },
      transactionRequest: { data: "unsigned-tx" },
    })
  })

  it("uses single LI.FI quote when lifi_from_amount_raw is stored", async () => {
    const result = await executeLifiWalletSend({
      admin,
      ctx: {} as never,
      session: { ...session, lifi_from_amount_raw: "10500000" },
      feeAddress: "fee-wallet",
      easnerTransactionId: "ETID-1",
    })

    expect(result.ok).toBe(true)
    expect(vi.mocked(lifiQuote)).toHaveBeenCalledTimes(1)
    expect(createTurnkeySend).not.toHaveBeenCalled()
    expect(vi.mocked(lifiQuote).mock.calls[0][0]).toMatchObject({
      fromAmount: "10500000",
      fee: 0,
    })
  })

  it("rejects when single-shot quote exceeds session floor", async () => {
    vi.mocked(lifiQuote).mockResolvedValue({
      id: "q-high",
      estimate: { fromAmount: "12000000", toAmount: "10000000" },
      transactionRequest: { data: "unsigned-tx" },
    })

    const result = await executeLifiWalletSend({
      admin,
      ctx: {} as never,
      session: { ...session, lifi_from_amount_raw: "12000000", lifi_floor: 10.5 },
      feeAddress: "fee-wallet",
      easnerTransactionId: "ETID-1",
    })

    expect(result).toEqual({ ok: false, error: "lifi_floor_exceeded" })
  })

  it("falls back to binary search when lifi_from_amount_raw is missing", async () => {
    vi.mocked(lifiQuote).mockImplementation(async (params) => {
      const from = Number(params.fromAmount) / 1e6
      const to = from >= 10.5 ? 10 : from * 0.7
      return {
        id: `q-${from}`,
        tool: "relay",
        estimate: {
          fromAmount: params.fromAmount,
          toAmount: String(Math.round(to * 1e6)),
        },
        transactionRequest: { data: "unsigned-tx" },
      }
    })

    const result = await executeLifiWalletSend({
      admin,
      ctx: {} as never,
      session: { ...session, lifi_from_amount_raw: null },
      feeAddress: "fee-wallet",
      easnerTransactionId: "ETID-1",
    })

    expect(result.ok).toBe(true)
    expect(vi.mocked(lifiQuote).mock.calls.length).toBeGreaterThan(1)
  })
})
