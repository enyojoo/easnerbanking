import { describe, expect, it } from "vitest"
import {
  isAllowedSystemSettingKey,
  normalizeSystemSettingValue,
} from "./system-settings-service"

describe("system-settings-service allowlist", () => {
  it("allows platform access and USD/EUR active keys", () => {
    expect(isAllowedSystemSettingKey("maintenance_mode_business")).toBe(true)
    expect(isAllowedSystemSettingKey("maintenance_mode_personal")).toBe(true)
    expect(isAllowedSystemSettingKey("registration_enabled_business")).toBe(true)
    expect(isAllowedSystemSettingKey("registration_enabled_personal")).toBe(true)
    expect(isAllowedSystemSettingKey("wallet_send_compliance_enabled")).toBe(true)
    expect(isAllowedSystemSettingKey("email_provider")).toBe(true)
    expect(isAllowedSystemSettingKey("currency_active_USD")).toBe(true)
    expect(isAllowedSystemSettingKey("currency_active_EUR")).toBe(true)
  })

  it("rejects GBP/NGN and Make available keys", () => {
    expect(isAllowedSystemSettingKey("currency_available_USD")).toBe(false)
    expect(isAllowedSystemSettingKey("currency_active_GBP")).toBe(false)
    expect(isAllowedSystemSettingKey("currency_active_NGN")).toBe(false)
    expect(isAllowedSystemSettingKey("session_timeout")).toBe(false)
    expect(() => normalizeSystemSettingValue("currency_available_EUR", "true")).toThrow(/Unknown/)
  })

  it("normalizes booleans and email provider", () => {
    expect(normalizeSystemSettingValue("maintenance_mode_business", true).value).toBe("true")
    expect(normalizeSystemSettingValue("currency_active_EUR", false).value).toBe("false")
    expect(normalizeSystemSettingValue("email_provider", "sendgrid").value).toBe("sendgrid")
    expect(() => normalizeSystemSettingValue("email_provider", "mailgun")).toThrow(/ses or sendgrid/)
  })
})
