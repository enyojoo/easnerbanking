import { describe, expect, it, vi } from "vitest"

vi.mock("./config", () => ({
  getYellowcardEnvironment: vi.fn(() => "production"),
}))

vi.mock("./http", () => ({
  yellowcardFetch: vi.fn(),
}))

import { getYellowcardEnvironment } from "./config"
import { yellowcardFetch } from "./http"
import {
  buildYcReceiveSubmitBody,
  buildYcReceiveSource,
  hydrateYcReceiveBankInfo,
  normalizeYcBankInfo,
  resolveYcBankInfoName,
} from "./receive-submit"

describe("buildYcReceiveSubmitBody", () => {
  it.each([
    ["bank", "bank_transfer"],
    ["momo", "mobile_money"],
  ] as const)("submits %s channel type without channelId", (channelType, payInRail) => {
    const body = buildYcReceiveSubmitBody({
      sequenceId: `seq-${channelType}`,
      customerUID: "user-1",
      channelType,
      currency: "NGN",
      country: "NG",
      localAmount: 1000,
      payInRail,
      settlementWalletAddress: "wallet-1",
    })

    expect(body.channelType).toBe(channelType)
    expect(body.channelId).toBeUndefined()
    expect((body.source as { accountType?: string }).accountType).toBe(channelType)
  })
})

describe("buildYcReceiveSource", () => {
  it("sets networkId for production mobile money", () => {
    vi.mocked(getYellowcardEnvironment).mockReturnValue("production")
    expect(
      buildYcReceiveSource({
        rail: "mobile_money",
        phone: "+2348012345678",
        networkId: "net-1",
      }),
    ).toEqual({
      accountType: "momo",
      accountNumber: "+2348012345678",
      networkId: "net-1",
    })
  })

  it("uses sandbox phone simulation and optional networkId", () => {
    vi.mocked(getYellowcardEnvironment).mockReturnValue("sandbox")
    expect(
      buildYcReceiveSource({
        rail: "mobile_money",
        phone: "1111111111",
        networkId: "net-sandbox",
        country: "KE",
      }),
    ).toEqual({
      accountType: "momo",
      accountNumber: "+2541111111111",
      networkId: "net-sandbox",
    })
  })

  it("returns bank accountType without phone for bank transfer", () => {
    vi.mocked(getYellowcardEnvironment).mockReturnValue("production")
    expect(
      buildYcReceiveSource({
        rail: "bank_transfer",
      }),
    ).toEqual({
      accountType: "bank",
    })
  })
})

describe("normalizeYcBankInfo", () => {
  it("mirrors YC name into bankName and drops duplicate name", () => {
    expect(normalizeYcBankInfo({ name: "PAGA", accountNumber: "1" })).toEqual({
      bankName: "PAGA",
      accountNumber: "1",
    })
  })

  it("resolves bank name from name key", () => {
    expect(resolveYcBankInfoName({ name: "PAGA" })).toBe("PAGA")
    expect(resolveYcBankInfoName({ accountName: "Sam", accountNumber: "1" })).toBe("")
  })

  it("flattens nested bank object name", () => {
    expect(
      normalizeYcBankInfo({
        accountName: "Sam",
        accountNumber: "1",
        bank: { name: "Nuvion MFB" },
      }),
    ).toEqual({
      accountName: "Sam",
      accountNumber: "1",
      bank: { name: "Nuvion MFB" },
      bankName: "Nuvion MFB",
    })
  })
})

describe("hydrateYcReceiveBankInfo", () => {
  it("looks up receive when bank name is missing on POST response", async () => {
    vi.mocked(yellowcardFetch).mockResolvedValueOnce({
      id: "yc-1",
      bankInfo: { name: "PAGA", accountName: "Sam", accountNumber: "845" },
    })

    const out = await hydrateYcReceiveBankInfo({
      id: "yc-1",
      bankInfo: { accountName: "Sam", accountNumber: "845" },
    })

    expect(yellowcardFetch).toHaveBeenCalledWith({
      method: "GET",
      path: "/receive/yc-1",
    })
    expect(out.bankInfo).toEqual({
      accountName: "Sam",
      accountNumber: "845",
      bankName: "PAGA",
    })
  })

  it("falls back to sequence lookup when id lookup omits bank name", async () => {
    vi.mocked(yellowcardFetch).mockReset()
    vi.mocked(yellowcardFetch)
      .mockResolvedValueOnce({
        id: "yc-1",
        bankInfo: { accountName: "Sam", accountNumber: "845" },
      })
      .mockResolvedValueOnce({
        id: "yc-1",
        bankInfo: { name: "Nuvion MFB", accountName: "Sam", accountNumber: "845" },
      })

    const out = await hydrateYcReceiveBankInfo({
      id: "yc-1",
      sequenceId: "seq-1",
      bankInfo: { accountName: "Sam", accountNumber: "845" },
    })

    expect(yellowcardFetch).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/receive/yc-1",
    })
    expect(yellowcardFetch).toHaveBeenNthCalledWith(2, {
      method: "GET",
      path: "/receive/sequence-id/seq-1",
    })
    expect(out.bankInfo?.bankName).toBe("Nuvion MFB")
  })

  it("skips lookup when name already present", async () => {
    vi.mocked(yellowcardFetch).mockClear()
    const out = await hydrateYcReceiveBankInfo({
      id: "yc-1",
      bankInfo: { name: "PAGA", accountNumber: "845" },
    })
    expect(yellowcardFetch).not.toHaveBeenCalled()
    expect(out.bankInfo?.bankName).toBe("PAGA")
    expect(out.bankInfo?.name).toBeUndefined()
  })
})
