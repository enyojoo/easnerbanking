import { describe, expect, it } from "vitest"
import {
  DEFAULT_COMMUNICATION_PREFERENCES,
  parseCommunicationPreferences,
} from "./communication-preferences"

describe("parseCommunicationPreferences", () => {
  it("defaults all channels and categories to on", () => {
    expect(parseCommunicationPreferences(undefined)).toEqual(DEFAULT_COMMUNICATION_PREFERENCES)
    expect(parseCommunicationPreferences(null)).toEqual(DEFAULT_COMMUNICATION_PREFERENCES)
    expect(parseCommunicationPreferences({})).toEqual(DEFAULT_COMMUNICATION_PREFERENCES)
  })

  it("respects explicit opt-out values", () => {
    expect(
      parseCommunicationPreferences({
        productUpdates: false,
        securityAlerts: false,
        marketingEmails: false,
        channels: { email: false, push: false },
      }),
    ).toEqual({
      productUpdates: false,
      securityAlerts: false,
      marketingEmails: false,
      channels: { email: false, push: false },
    })
  })

  it("merges partial objects with defaults for missing keys", () => {
    expect(parseCommunicationPreferences({ channels: { email: false } })).toEqual({
      productUpdates: true,
      securityAlerts: true,
      marketingEmails: true,
      channels: { email: false, push: true },
    })
  })
})
