import { describe, expect, it } from "vitest"
import {
  generateAuthOtpBlock,
  generateSupabaseAuthEmailHtml,
} from "./email-generator"
import {
  EASNER_COMPANY_LEGAL_NAME,
  EASNER_EMAIL_ACCOUNT_NOTICE,
  EASNER_EMAIL_NO_ACCOUNT_NOTICE,
  EASNER_LOGO_URL_DARK,
  EASNER_LOGO_URL_LIGHT,
} from "./email-theme"

describe("generateSupabaseAuthEmailHtml", () => {
  it("includes Supabase token placeholder and shared footer", () => {
    const html = generateSupabaseAuthEmailHtml("password_reset")
    expect(html).toContain("{{ .Token }}")
    expect(html).toContain(EASNER_LOGO_URL_LIGHT)
    expect(html).toContain(EASNER_LOGO_URL_DARK)
    expect(html).toContain("logo-light")
    expect(html).toContain("logo-dark")
    expect(html).toContain(EASNER_COMPANY_LEGAL_NAME)
    expect(html).toContain(EASNER_EMAIL_ACCOUNT_NOTICE)
    expect(html).not.toContain(EASNER_EMAIL_NO_ACCOUNT_NOTICE)
    expect(html).toContain("584 Castro St, Suite 4092")
    expect(html).toContain("Password reset")
  })

  it("uses pre-account footer for confirm signup", () => {
    const html = generateSupabaseAuthEmailHtml("signup_verify")
    expect(html).toContain(EASNER_EMAIL_NO_ACCOUNT_NOTICE)
    expect(html).not.toContain(EASNER_EMAIL_ACCOUNT_NOTICE)
  })

  it("renders signup variant copy", () => {
    const html = generateSupabaseAuthEmailHtml("signup_verify")
    expect(html).toContain("Verify your email")
    expect(html).not.toContain("password reset screen")
  })

  it("omits manage preferences for auth mail", () => {
    const html = generateSupabaseAuthEmailHtml("signup_verify")
    expect(html).not.toContain("Manage email preferences")
  })

  it("generateAuthOtpBlock preserves custom placeholder", () => {
    expect(generateAuthOtpBlock("123456")).toContain("123456")
  })
})
