import { describe, expect, it } from "vitest"
import {
  EASNER_EMAIL_ACCOUNT_NOTICE,
  EASNER_EMAIL_NO_ACCOUNT_NOTICE,
  resolveEmailFooterNotice,
} from "./email-theme"

describe("resolveEmailFooterNotice", () => {
  it("uses existing-account copy by default", () => {
    expect(resolveEmailFooterNotice()).toBe(EASNER_EMAIL_ACCOUNT_NOTICE)
    expect(resolveEmailFooterNotice(true)).toBe(EASNER_EMAIL_ACCOUNT_NOTICE)
  })

  it("uses pre-account copy when recipient has no Easner account yet", () => {
    expect(resolveEmailFooterNotice(false)).toBe(EASNER_EMAIL_NO_ACCOUNT_NOTICE)
    expect(resolveEmailFooterNotice(false)).not.toBe(EASNER_EMAIL_ACCOUNT_NOTICE)
  })
})
