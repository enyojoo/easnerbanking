import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/relay/client", () => ({
  relayGetRequestV3: vi.fn(),
}))

vi.mock("@/lib/turnkey/resolve-send-client", () => ({
  resolveTurnkeySendClient: vi.fn(),
}))

vi.mock("@/lib/turnkey/config", () => ({
  getTurnkeySolanaBroadcastCaip2: () => "solana:101",
  isTurnkeySolSponsorshipEnabled: () => true,
}))

vi.mock("@/lib/wallet/resolve-wallet-owner", () => ({
  resolveTurnkeyAddressForNoahPair: vi.fn(),
  resolveWalletOwnerIdForEasnerContext: vi.fn().mockResolvedValue("owner-1"),
}))

vi.mock("../relay-wallet-quote", () => ({
  quoteRelayWalletBridge: vi.fn(),
  quoteRelayWalletBridgeFromAmountRaw: vi.fn(),
}))

import { relayGetRequestV3 } from "@/lib/relay/client"
import { resolveTurnkeySendClient } from "@/lib/turnkey/resolve-send-client"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import {
  quoteRelayWalletBridge,
  quoteRelayWalletBridgeFromAmountRaw,
} from "../relay-wallet-quote"
import { executeRelayWalletSend } from "../relay-execute"

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
  relay_mid: 0.98,
  relay_floor: 10.5,
  total_debited: 12,
  margin_amount: 0,
  execution_model: "relay_bridge" as const,
  status: "quoted",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
}

const quoteFixture = {
  requestId: "req-exec",
  details: {
    currencyIn: { amount: "10500000" },
    currencyOut: { amount: "10000000", amountFormatted: "10" },
  },
  steps: [{ items: [{ data: { data: "unsigned-tx" } }] }],
}

describe("executeRelayWalletSend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveTurnkeyAddressForNoahPair).mockResolvedValue("vault-sol")
    vi.mocked(resolveTurnkeySendClient).mockResolvedValue({
      ok: true,
      client: {
        solSendTransaction: vi.fn().mockResolvedValue({
          sendTransactionStatusId: "tk-1",
          signature: "sig-1",
        }),
      },
      organizationId: "sub-org",
      stampingMode: "root",
    })
    vi.mocked(quoteRelayWalletBridgeFromAmountRaw).mockResolvedValue(quoteFixture as never)
    vi.mocked(quoteRelayWalletBridge).mockResolvedValue(quoteFixture as never)
    vi.mocked(relayGetRequestV3).mockResolvedValue(null)
  })

  it("uses single Relay quote when relay_from_amount_raw is stored", async () => {
    const result = await executeRelayWalletSend({
      admin,
      ctx: {} as never,
      session: { ...session, relay_from_amount_raw: "10500000" },
      feeAddress: "fee-wallet",
      easnerTransactionId: "ETID-1",
    })

    expect(result.ok).toBe(true)
    expect(vi.mocked(quoteRelayWalletBridgeFromAmountRaw)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(quoteRelayWalletBridge)).not.toHaveBeenCalled()
  })

  it("rejects when single-shot quote exceeds session floor", async () => {
    vi.mocked(quoteRelayWalletBridgeFromAmountRaw).mockResolvedValue({
      ...quoteFixture,
      details: { currencyIn: { amount: "12000000" }, currencyOut: { amount: "10000000" } },
    } as never)

    const result = await executeRelayWalletSend({
      admin,
      ctx: {} as never,
      session: { ...session, relay_from_amount_raw: "12000000", relay_floor: 10.5 },
      feeAddress: "fee-wallet",
      easnerTransactionId: "ETID-1",
    })

    expect(result).toEqual({ ok: false, error: "relay_floor_exceeded" })
  })

  it("falls back to receive search when relay_from_amount_raw is missing", async () => {
    const result = await executeRelayWalletSend({
      admin,
      ctx: {} as never,
      session: { ...session, relay_from_amount_raw: null },
      feeAddress: "fee-wallet",
      easnerTransactionId: "ETID-1",
    })

    expect(result.ok).toBe(true)
    expect(vi.mocked(quoteRelayWalletBridge)).toHaveBeenCalledTimes(1)
  })
})
