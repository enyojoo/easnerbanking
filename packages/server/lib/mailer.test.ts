import { describe, expect, it, vi } from "vitest"
import { sendMail } from "./mailer"

describe("sendMail", () => {
  it("skips suppressed recipients for either provider", async () => {
    const sendSes = vi.fn()
    const result = await sendMail(
      {
        to: "bounce@example.com",
        from: "noreply@easner.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      },
      {
        isSuppressed: async () => true,
        resolveProvider: async () => "ses",
        sendSes,
      },
    )
    expect(result).toEqual({ success: true, skipped: true, skipReason: "suppressed" })
    expect(sendSes).not.toHaveBeenCalled()
  })

  it("routes to SES when the resolved provider is ses", async () => {
    process.env.AWS_ACCESS_KEY_ID = "akid"
    process.env.AWS_SECRET_ACCESS_KEY = "secret"
    const sendSes = vi.fn(async () => ({ success: true, messageId: "ses-1" }))
    const sendSendgrid = vi.fn()
    const result = await sendMail(
      {
        to: "user@example.com",
        from: { email: "noreply@easner.com", name: "Easner" },
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      },
      {
        isSuppressed: async () => false,
        resolveProvider: async () => "ses",
        sendSes,
        sendSendgrid,
      },
    )
    expect(result).toEqual({ success: true, messageId: "ses-1" })
    expect(sendSes).toHaveBeenCalledTimes(1)
    expect(sendSendgrid).not.toHaveBeenCalled()
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
  })

  it("routes to SendGrid when the resolved provider is sendgrid", async () => {
    process.env.SENDGRID_API_KEY = "sg.test"
    const sendSendgrid = vi.fn(async () => ({ success: true, messageId: "sg-1" }))
    const sendSes = vi.fn()
    const result = await sendMail(
      {
        to: "user@example.com",
        from: "noreply@easner.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      },
      {
        isSuppressed: async () => false,
        resolveProvider: async () => "sendgrid",
        sendSes,
        sendSendgrid,
      },
    )
    expect(result).toEqual({ success: true, messageId: "sg-1" })
    expect(sendSendgrid).toHaveBeenCalledTimes(1)
    expect(sendSes).not.toHaveBeenCalled()
    delete process.env.SENDGRID_API_KEY
  })

  it("fails loudly when the selected provider has no credentials", async () => {
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    const sendSes = vi.fn()
    const result = await sendMail(
      {
        to: "user@example.com",
        from: "noreply@easner.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      },
      {
        isSuppressed: async () => false,
        resolveProvider: async () => "ses",
        sendSes,
      },
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SES credentials missing/)
    expect(sendSes).not.toHaveBeenCalled()
  })
})
