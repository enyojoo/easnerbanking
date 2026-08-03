import { describe, expect, it, vi, beforeEach } from "vitest"
import { TLC_LOCAL_TRANSFER_METHOD } from "@easner/shared"

vi.mock("@/lib/fx/yc-rates", () => ({
  listYcRates: vi.fn(),
  findYcCrossRate: vi.fn(),
  findYcPayInLeg: vi.fn(),
  findYcRate: vi.fn(),
}))

vi.mock("@/lib/yellowcard/send-submit", () => ({
  submitYcSend: vi.fn(),
}))

vi.mock("@/lib/yellowcard/receive-submit", () => ({
  submitYcReceive: vi.fn(),
}))

vi.mock("@/lib/yellowcard/execute-yc-crypto-deposit", () => ({
  executeYcCryptoDeposit: vi.fn(),
}))

vi.mock("@/lib/yellowcard/kyc-metadata", () => ({
  buildYcKycPersonMetadata: vi.fn(),
}))

vi.mock("@/lib/payout-providers/yellowcard-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payout-providers/yellowcard-provider")>()
  return {
    ...actual,
    resolveYcSendChannelId: vi.fn(),
  }
})

vi.mock("@/lib/yellowcard/map-recipient-to-yc-send", () => ({
  mapRecipientToYcSend: vi.fn(),
}))

vi.mock("@/lib/yellowcard/channels", () => ({
  listYellowcardChannels: vi.fn(),
  toYcChannelType: (rail: string) => rail === "mobile_money" ? "momo" : "bank",
  readYcResponseChannelId: (response: Record<string, unknown>) =>
    String(response?.channelId ?? response?.channel_id ?? "").trim() || null,
}))

vi.mock("@/lib/yellowcard/yc-receive-gate", () => ({
  isYcLocalPayInEnabledForCorridor: vi.fn(async () => true),
}))

vi.mock("@/lib/pay-in-limit-check", () => ({
  validateFundBalancePayInAmountLimits: vi.fn(async () => ({ ok: true })),
}))

vi.mock("@/lib/terminal/recipient-sell-prepare", () => ({
  resolveRecipientPayoutCountry: vi.fn(() => "US"),
}))

vi.mock("@/lib/processing-fee/fee-wallet-sweep", () => ({
  readPriorSweepFromMetadata: vi.fn(() => ({ captured: false })),
  sweepEasnerRevenueFromDepositOmnibus: vi.fn(),
}))

import { sweepEasnerRevenueFromDepositOmnibus } from "@/lib/processing-fee/fee-wallet-sweep"
import {
  completeCrossBorderOnSendSuccess,
  createCrossBorderDraft,
  createCrossBorderTransfer,
  isCrossBorderLeg1OmnibusSufficient,
  lockCrossBorderLeg2,
} from "./cross-border-orchestrator"

describe("lockCrossBorderLeg2", () => {
  it("requires MoMo source phone and network", async () => {
    await expect(
      lockCrossBorderLeg2({
        admin: {} as never,
        userId: "user-1",
        customerUID: "user-1",
        payInCurrency: "NGN",
        payInCountry: "NG",
        payInRail: "mobile_money",
        receiveAmount: 100,
        recipient: { id: "r-1", currency: "USD", country_code: "US" } as never,
        senderProfile: { residenceCountry: "NG" },
      }),
    ).rejects.toThrow("Mobile number and network are required")
  })
})

describe("createCrossBorderTransfer", () => {
  it("requires MoMo source phone and network", async () => {
    await expect(
      createCrossBorderTransfer({
        admin: {} as never,
        userId: "user-1",
        customerUID: "user-1",
        payInCurrency: "NGN",
        payInCountry: "NG",
        payInRail: "mobile_money",
        receiveAmount: 100,
        recipient: { id: "r-1", currency: "USD", country_code: "US" } as never,
        senderProfile: { residenceCountry: "NG" },
      }),
    ).rejects.toThrow("Mobile number and network are required")
  })
})

describe("createCrossBorderDraft", () => {
  it("is exported for legacy ops recovery", () => {
    expect(typeof createCrossBorderDraft).toBe("function")
  })
})

describe("TLC payout_review invariant", () => {
  it("uses Local Transfer constant for cross-border transfer method", () => {
    expect(TLC_LOCAL_TRANSFER_METHOD).toBe("Local Transfer")
  })
})

describe("isCrossBorderLeg1OmnibusSufficient", () => {
  it("returns true when omnibus covers leg2 + fee + margin", () => {
    expect(
      isCrossBorderLeg1OmnibusSufficient({
        omnibusAmount: 105,
        metadata: {
          omnibus_in_expected: 105,
          leg2_crypto_expected: 100,
          processing_fee: 1,
          margin_amount: 2,
        },
      }),
    ).toBe(true)
  })

  it("returns false when omnibus is under-funded", () => {
    expect(
      isCrossBorderLeg1OmnibusSufficient({
        omnibusAmount: 100,
        metadata: {
          omnibus_in_expected: 105,
          leg2_crypto_expected: 100,
          processing_fee: 1,
          margin_amount: 2,
        },
      }),
    ).toBe(false)
  })

  it("allows legacy rows without omnibus_in_expected", () => {
    expect(
      isCrossBorderLeg1OmnibusSufficient({
        omnibusAmount: 50,
        metadata: { processing_fee: 1, margin_amount: 2 },
      }),
    ).toBe(true)
  })
})

describe("completeCrossBorderOnSendSuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sweepEasnerRevenueFromDepositOmnibus).mockResolvedValue({
      feeWalletSweepTxHash: "sweep-hash",
      captured: true,
      turnkeySendId: null,
    })
  })

  it("caps fee wallet sweep to post-leg2 omnibus residual", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      update: vi.fn().mockReturnThis(),
    }
    const admin = {
      from: vi.fn(() => chain),
    } as never

    chain.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id: "tr-1",
          status: "leg2_pending",
          omnibus_in_actual: 105,
          settlement_info: { send: { cryptoAmount: 100 } },
          metadata: {
            processing_fee: 20,
            margin_amount: 10,
          },
          transaction_id: null,
        },
      })

    await completeCrossBorderOnSendSuccess(admin, "tr-1")

    expect(sweepEasnerRevenueFromDepositOmnibus).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5 }),
    )
  })
})
