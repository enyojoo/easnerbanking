import { describe, expect, it, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/lib/fx/yc-rates", () => ({
  listYcRates: vi.fn(),
  findYcPayInLeg: vi.fn(),
}))

vi.mock("@/lib/yellowcard/channels", () => ({
  listYellowcardChannels: vi.fn(),
}))

vi.mock("@/lib/yellowcard/receive-rails", () => ({
  findYcReceiveChannel: vi.fn(),
}))

vi.mock("@/lib/yellowcard/yc-receive-gate", () => ({
  isYcLocalPayInEnabledForCorridor: vi.fn(),
}))

vi.mock("@/lib/deposit-omnibus/config", () => ({
  depositOmnibusSolanaAddressUsd: vi.fn(() => "omnibus-wallet"),
}))

vi.mock("@/lib/yellowcard/kyc-metadata", () => ({
  buildYcKycPersonMetadata: vi.fn(() => ({ name: "Test User" })),
}))

vi.mock("@/lib/transaction-id", () => ({
  generateTransactionId: vi.fn(() => "ETID123"),
}))

import { listYcRates, findYcPayInLeg } from "@/lib/fx/yc-rates"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import {
  authorizeFundBalanceDraft,
  createFundBalanceDraft,
  FundBalanceSessionError,
} from "./fund-balance-session"

function makeAdmin(transferRow: Record<string, unknown> | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: transferRow }),
    single: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  }
  return {
    from: vi.fn(() => chain),
    chain,
  } as unknown as SupabaseClient & { chain: typeof chain }
}

describe("createFundBalanceDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listYcRates).mockResolvedValue([])
    vi.mocked(findYcPayInLeg).mockReturnValue({
      easner_sell: 1500,
      yc_buy: 1400,
    } as never)
    vi.mocked(isYcLocalPayInEnabledForCorridor).mockResolvedValue(true)
    vi.mocked(listYellowcardChannels).mockResolvedValue([])
    vi.mocked(findYcReceiveChannel).mockReturnValue({ id: "ch-1" } as never)
  })

  it("rejects non-mobile_money rail", async () => {
    const admin = makeAdmin(null)
    await expect(
      createFundBalanceDraft({
        admin,
        kycUserId: "user-1",
        businessId: null,
        currency: "NGN",
        country: "NG",
        rail: "bank_transfer",
        usdCredit: 10,
        userRow: { residence_country: "NG" },
      }),
    ).rejects.toMatchObject({ code: "invalid_rail" })
  })

  it("inserts pending_authorize transfer for mobile money", async () => {
    const admin = makeAdmin(null)
    admin.chain.single
      .mockResolvedValueOnce({ data: { id: "tx-1" } })
      .mockResolvedValueOnce({ data: { id: "tr-1" } })

    const result = await createFundBalanceDraft({
      admin,
      kycUserId: "user-1",
      businessId: null,
      currency: "NGN",
      country: "NG",
      rail: "mobile_money",
      usdCredit: 10,
      userRow: { residence_country: "NG" },
    })

    expect(result.ok).toBe(true)
    expect(result.transferId).toBe("tr-1")
    expect(result.transactionId).toBe("ETID123")
    expect(admin.from).toHaveBeenCalledWith("yc_transfers")
    const insertArg = admin.chain.insert.mock.calls.find(
      (call) => call[0]?.status === "pending_authorize",
    )?.[0]
    expect(insertArg?.status).toBe("pending_authorize")
  })
})

describe("authorizeFundBalanceDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects missing phone or network", async () => {
    const admin = makeAdmin(null)
    await expect(
      authorizeFundBalanceDraft({
        admin,
        kycUserId: "user-1",
        transferId: "tr-1",
        sourcePhone: "",
        networkId: "net-1",
      }),
    ).rejects.toBeInstanceOf(FundBalanceSessionError)
  })

  it("rejects expired draft", async () => {
    const admin = makeAdmin({
      id: "tr-1",
      mode: "fund_balance",
      status: "pending_authorize",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      pay_in_currency: "NGN",
      leg1_sequence_id: "seq-1",
      leg1_channel_id: "ch-1",
      metadata: { sender: { name: "Test" } },
    })

    await expect(
      authorizeFundBalanceDraft({
        admin,
        kycUserId: "user-1",
        transferId: "tr-1",
        sourcePhone: "+2348012345678",
        networkId: "net-1",
      }),
    ).rejects.toMatchObject({ code: "quote_expired" })
  })
})
