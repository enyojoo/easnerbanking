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
  buildYcReceiveSource,
  hydrateYcReceiveBankInfo,
  normalizeYcBankInfo,
  resolveYcBankInfoName,
} from "./receive-submit"

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
