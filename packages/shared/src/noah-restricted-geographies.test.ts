import { describe, expect, it } from "vitest"
import {
  isCountryAllowedForNoahPreScreen,
  isNoahRestrictedGeography,
} from "./noah-restricted-geographies"

describe("noah-restricted-geographies", () => {
  it("blocks GB on Mobile / Noah pre-screen", () => {
    expect(isNoahRestrictedGeography("GB")).toBe(true)
    expect(isCountryAllowedForNoahPreScreen("gb")).toBe(false)
  })

  it("allows KE and MA (not Noah fully prohibited)", () => {
    expect(isNoahRestrictedGeography("KE")).toBe(false)
    expect(isNoahRestrictedGeography("MA")).toBe(false)
    expect(isCountryAllowedForNoahPreScreen("KE")).toBe(true)
  })

  it("treats empty input as not restricted", () => {
    expect(isNoahRestrictedGeography(null)).toBe(false)
    expect(isCountryAllowedForNoahPreScreen(undefined)).toBe(true)
  })
})
