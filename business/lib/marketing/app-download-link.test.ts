import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  isAppDownloadLinkEmailEnabled,
  isValidMarketingEmail,
  normalizeMarketingEmail,
  requestAppDownloadLinkEmail,
} from "./app-download-link"

vi.mock("@easner/server", () => ({
  emailService: {
    sendAppDownloadLinkEmail: vi.fn(async () => ({ success: true, messageId: "msg-1" })),
  },
}))

vi.mock("@/lib/payroll/rate-limit", () => ({
  enforcePayrollRateLimit: vi.fn(async () => true),
}))

import { emailService } from "@easner/server"
import { enforcePayrollRateLimit } from "@/lib/payroll/rate-limit"

const admin = {} as never

describe("app-download-link marketing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SENDGRID_API_KEY = "sg.test"
    delete process.env.MARKETING_APP_DOWNLOAD_EMAIL_ENABLED
  })

  it("normalizes email", () => {
    expect(normalizeMarketingEmail("  Foo@Bar.COM ")).toBe("foo@bar.com")
    expect(isValidMarketingEmail("foo@bar.com")).toBe(true)
    expect(isValidMarketingEmail("not-an-email")).toBe(false)
  })

  it("respects kill switch env", () => {
    process.env.MARKETING_APP_DOWNLOAD_EMAIL_ENABLED = "false"
    expect(isAppDownloadLinkEmailEnabled()).toBe(false)
  })

  it("returns ok without sending for invalid email", async () => {
    const result = await requestAppDownloadLinkEmail({
      admin,
      email: "bad",
      clientIp: "1.2.3.4",
    })
    expect(result).toEqual({ ok: true, sent: false })
    expect(emailService.sendAppDownloadLinkEmail).not.toHaveBeenCalled()
  })

  it("blocks disposable domains", async () => {
    const result = await requestAppDownloadLinkEmail({
      admin,
      email: "bot@mailinator.com",
      clientIp: "1.2.3.4",
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("DISPOSABLE_EMAIL")
    }
  })

  it("sends appDownloadLink template for valid email", async () => {
    const result = await requestAppDownloadLinkEmail({
      admin,
      email: "visitor@example.com",
      clientIp: "1.2.3.4",
    })
    expect(result).toEqual({ ok: true, sent: true })
    expect(enforcePayrollRateLimit).toHaveBeenCalledTimes(2)
    expect(emailService.sendAppDownloadLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "visitor@example.com",
        appStoreUrl: expect.stringContaining("/download"),
        playStoreUrl: expect.stringContaining("/download"),
        appWebUrl: "https://app.easner.com",
      }),
    )
  })
})
