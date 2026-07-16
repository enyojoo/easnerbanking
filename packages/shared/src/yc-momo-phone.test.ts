import { describe, expect, it } from "vitest"
import {
  buildYcMomoPhoneFromLocal,
  normalizeYcMomoPhone,
  parseYcMomoLocalPhone,
  resolveYcMomoCallingCodeLabel,
} from "./yc-momo-phone"

describe("normalizeYcMomoPhone", () => {
  it("prefixes Kenya local digits", () => {
    expect(normalizeYcMomoPhone("1111111111", "KE")).toBe("+2541111111111")
    expect(normalizeYcMomoPhone("0712345678", "KE")).toBe("+254712345678")
  })

  it("preserves international input", () => {
    expect(normalizeYcMomoPhone("+254712345678", "KE")).toBe("+254712345678")
  })

  it("normalizes Nigeria leading zero", () => {
    expect(normalizeYcMomoPhone("08012345678", "NG")).toBe("+2348012345678")
  })
})

describe("parseYcMomoLocalPhone", () => {
  it("returns local digits from international phone", () => {
    expect(parseYcMomoLocalPhone("+254712345678", "KE")).toBe("712345678")
  })

  it("returns local digits unchanged", () => {
    expect(parseYcMomoLocalPhone("1111111111", "KE")).toBe("1111111111")
  })
})

describe("buildYcMomoPhoneFromLocal", () => {
  it("combines prefix and local digits", () => {
    expect(buildYcMomoPhoneFromLocal("712345678", "KE")).toBe("+254712345678")
  })
})

describe("resolveYcMomoCallingCodeLabel", () => {
  it("returns + prefix label", () => {
    expect(resolveYcMomoCallingCodeLabel("KE")).toBe("+254")
  })
})
