import { describe, expect, it, vi } from "vitest"
import { SendEmailCommand } from "@aws-sdk/client-sesv2"

const send = vi.fn(async () => ({ MessageId: "ses-raw-1" }))

vi.mock("@aws-sdk/client-sesv2", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-sesv2")>("@aws-sdk/client-sesv2")
  return {
    ...actual,
    SESv2Client: vi.fn().mockImplementation(() => ({ send })),
  }
})

import { resetSesClientForTests, sendViaSes } from "./ses-mailer"

describe("sendViaSes", () => {
  it("uses Simple content without attachments and Raw with PDFs", async () => {
    process.env.AWS_ACCESS_KEY_ID = "akid"
    process.env.AWS_SECRET_ACCESS_KEY = "secret"
    resetSesClientForTests()
    send.mockClear()

    await sendViaSes({
      to: "user@example.com",
      from: { email: "noreply@easner.com", name: "Easner" },
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    })
    const simpleCmd = send.mock.calls[0]?.[0] as SendEmailCommand
    expect(simpleCmd.input.Content?.Simple).toBeTruthy()
    expect(simpleCmd.input.Content?.Raw).toBeUndefined()

    await sendViaSes({
      to: "user@example.com",
      from: "noreply@easner.com",
      subject: "Stub",
      html: "<p>PDF</p>",
      text: "PDF",
      attachments: [
        {
          content: Buffer.from("pdf").toString("base64"),
          filename: "stub.pdf",
          type: "application/pdf",
        },
      ],
    })
    const rawCmd = send.mock.calls[1]?.[0] as SendEmailCommand
    expect(rawCmd.input.Content?.Raw?.Data).toBeTruthy()
    expect(rawCmd.input.Content?.Simple).toBeUndefined()

    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    resetSesClientForTests()
  })
})
