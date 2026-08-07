import { describe, expect, it } from "vitest"
import {
  applePrivateRelayFromIdToken,
  isApplePrivateRelayEmail,
  parseAppleIsPrivateEmailClaim,
  resolveSignupEmailBlock,
} from "./signup-email-policy"

describe("signup-email-policy", () => {
  it("detects Apple private relay by domain", () => {
    expect(isApplePrivateRelayEmail("fwv8h2njzf@privaterelay.appleid.com")).toBe(true)
    expect(isApplePrivateRelayEmail("user@gmail.com")).toBe(false)
  })

  it("parses Apple is_private_email claim forms", () => {
    expect(parseAppleIsPrivateEmailClaim(true)).toBe(true)
    expect(parseAppleIsPrivateEmailClaim("true")).toBe(true)
    expect(parseAppleIsPrivateEmailClaim("false")).toBe(false)
    expect(parseAppleIsPrivateEmailClaim(undefined)).toBe(false)
  })

  it("blocks disposable and relay emails for signup", () => {
    expect(resolveSignupEmailBlock("x@mailinator.com")?.code).toBe("DISPOSABLE_EMAIL")
    expect(resolveSignupEmailBlock("x@privaterelay.appleid.com")?.code).toBe("APPLE_PRIVATE_RELAY_EMAIL")
    expect(resolveSignupEmailBlock("real@company.com")).toBeNull()
  })

  it("reads is_private_email from Apple id_token payload", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")
    const payload = Buffer.from(
      JSON.stringify({
        email: "abc@privaterelay.appleid.com",
        is_private_email: "true",
      }),
    ).toString("base64url")
    const token = `${header}.${payload}.sig`
    expect(applePrivateRelayFromIdToken(token)).toBe(true)
  })
})
