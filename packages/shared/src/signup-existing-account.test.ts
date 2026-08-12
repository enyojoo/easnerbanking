import { describe, expect, it } from "vitest"
import {
  isSupabaseSignupDuplicateUser,
  mapSupabaseSignupDuplicateError,
  resolveSignupExistingAccountBlock,
  SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE,
} from "./signup-existing-account"

describe("signup-existing-account", () => {
  it("same-surface business asks to sign in", () => {
    const block = resolveSignupExistingAccountBlock({
      surface: "business_web",
      existingRole: "business",
    })
    expect(block.code).toBe("EMAIL_REGISTERED_SAME_SURFACE")
    expect(block.error).toBe(SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE)
  })

  it("same-surface mobile asks to sign in", () => {
    const block = resolveSignupExistingAccountBlock({
      surface: "consumer_mobile",
      existingRole: "individual",
    })
    expect(block.code).toBe("EMAIL_REGISTERED_SAME_SURFACE")
    expect(block.error).toBe(SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE)
  })

  it("cross-surface points to the other product", () => {
    const toMobile = resolveSignupExistingAccountBlock({
      surface: "consumer_mobile",
      existingRole: "business",
    })
    expect(toMobile.code).toBe("EMAIL_REGISTERED_OTHER_SURFACE")
    expect(toMobile.error).toMatch(/Easner Business/)

    const toBusiness = resolveSignupExistingAccountBlock({
      surface: "business_web",
      existingRole: "individual",
    })
    expect(toBusiness.code).toBe("EMAIL_REGISTERED_OTHER_SURFACE")
    expect(toBusiness.error).toMatch(/Easner Mobile/)
  })

  it("detects empty-identities duplicate signup responses", () => {
    expect(isSupabaseSignupDuplicateUser({ identities: [] })).toBe(true)
    expect(isSupabaseSignupDuplicateUser({ identities: [{ id: "1" }] })).toBe(false)
    expect(isSupabaseSignupDuplicateUser(null)).toBe(false)
  })

  it("maps common Supabase duplicate error strings", () => {
    expect(mapSupabaseSignupDuplicateError("User already registered")).toBe(
      SIGNUP_EXISTING_ACCOUNT_SAME_SURFACE,
    )
    expect(mapSupabaseSignupDuplicateError("Something else")).toBeNull()
  })
})
