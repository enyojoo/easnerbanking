import { describe, expect, it, vi } from "vitest"

vi.mock("./config", () => ({
  getYellowcardEnvironment: vi.fn(() => "production"),
}))

import { getYellowcardEnvironment } from "./config"
import { buildYcReceiveSource } from "./receive-submit"

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
