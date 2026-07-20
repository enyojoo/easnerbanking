import { afterEach, describe, expect, it } from "vitest"
import {
  getYellowcardEnvironment,
  getYellowcardRelaySecret,
  getYellowcardRelayUrl,
  isYcCryptoDepositDryRun,
} from "./config"

describe("isYcCryptoDepositDryRun", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("defaults to dry-run in sandbox", () => {
    process.env.YELLOWCARD_ENVIRONMENT = "sandbox"
    delete process.env.YC_CRYPTO_DEPOSIT_DRY_RUN
    delete process.env.DEPOSIT_SPLIT_DRY_RUN
    expect(isYcCryptoDepositDryRun()).toBe(true)
  })

  it("does not dry-run in production unless explicitly enabled", () => {
    process.env.YELLOWCARD_ENVIRONMENT = "production"
    delete process.env.YC_CRYPTO_DEPOSIT_DRY_RUN
    delete process.env.DEPOSIT_SPLIT_DRY_RUN
    expect(isYcCryptoDepositDryRun()).toBe(false)
  })

  it("honors YC_CRYPTO_DEPOSIT_DRY_RUN=false in sandbox", () => {
    process.env.YELLOWCARD_ENVIRONMENT = "sandbox"
    process.env.YC_CRYPTO_DEPOSIT_DRY_RUN = "false"
    expect(isYcCryptoDepositDryRun()).toBe(false)
  })

  it("reads environment helper", () => {
    process.env.YELLOWCARD_ENVIRONMENT = "production"
    expect(getYellowcardEnvironment()).toBe("production")
  })

  it("reads relay config helpers", () => {
    process.env.YELLOWCARD_RELAY_URL = "https://relay.example.com/"
    process.env.YC_RELAY_SECRET = "relay-secret"
    expect(getYellowcardRelayUrl()).toBe("https://relay.example.com")
    expect(getYellowcardRelaySecret()).toBe("relay-secret")
  })
})
