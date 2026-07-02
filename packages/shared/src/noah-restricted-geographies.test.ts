import { describe, expect, it } from "vitest"
import {
  isCountryAllowedForNoahPreScreen,
  isNoahRestrictedGeography,
} from "./noah-restricted-geographies"

describe("noah-restricted-geographies", () => {
  it("never blocks GB (UK)", () => {
    expect(isNoahRestrictedGeography("GB")).toBe(false)
    expect(isCountryAllowedForNoahPreScreen("gb")).toBe(true)
  })

  it("treats empty input as allowed for pre-screen helper", () => {
    expect(isNoahRestrictedGeography(null)).toBe(false)
    expect(isCountryAllowedForNoahPreScreen(undefined)).toBe(true)
  })
})
