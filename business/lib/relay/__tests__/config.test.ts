import { describe, expect, it, afterEach } from "vitest"
import {
  getRelayBridgeMinSourceUsdc,
  relayQuoteFeeParams,
  requireCryptoRatesProbeSolAddress,
  resolveCryptoRatesProbeSolAddress,
} from "../config"

describe("relay config", () => {
  const env = { ...process.env }

  afterEach(() => {
    process.env = { ...env }
  })

  it("relayQuoteFeeParams returns empty when sponsorship off", () => {
    process.env.RELAY_SPONSORSHIP_ENABLED = "false"
    expect(relayQuoteFeeParams()).toEqual({})
  })

  it("relayQuoteFeeParams sets subsidizeFees when sponsorship on", () => {
    process.env.RELAY_SPONSORSHIP_ENABLED = "true"
    expect(relayQuoteFeeParams()).toEqual({ subsidizeFees: true })
  })

  it("defaults bridge min source to 7", () => {
    delete process.env.RELAY_BRIDGE_MIN_FROM_USDC
    expect(getRelayBridgeMinSourceUsdc()).toBe(7)
  })

  it("resolves probe address from USD omnibus", () => {
    process.env.DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD = "OmnibusProbe111"
    expect(resolveCryptoRatesProbeSolAddress()).toBe("OmnibusProbe111")
    expect(requireCryptoRatesProbeSolAddress()).toBe("OmnibusProbe111")
  })
})
