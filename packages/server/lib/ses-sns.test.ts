import { describe, expect, it } from "vitest"
import { parseSesNotificationMessage, parseSnsEnvelope, isTrustedSnsCertUrl } from "./ses-sns"

describe("ses SNS parse", () => {
  it("accepts SNS cert URLs only on sns.*.amazonaws.com", () => {
    expect(
      isTrustedSnsCertUrl("https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-abc.pem"),
    ).toBe(true)
    expect(isTrustedSnsCertUrl("https://evil.example.com/SimpleNotificationService-abc.pem")).toBe(false)
  })

  it("parses bounce and complaint recipient lists", () => {
    const bounce = parseSesNotificationMessage(
      JSON.stringify({
        notificationType: "Bounce",
        bounce: { bouncedRecipients: [{ emailAddress: "Bad@Example.com" }] },
      }),
    )
    expect(bounce).toMatchObject({ kind: "bounce", emails: ["bad@example.com"] })

    const complaint = parseSesNotificationMessage(
      JSON.stringify({
        notificationType: "Complaint",
        complaint: { complainedRecipients: [{ emailAddress: "user@example.com" }] },
      }),
    )
    expect(complaint).toMatchObject({ kind: "complaint", emails: ["user@example.com"] })
  })

  it("parses a SubscriptionConfirmation envelope", () => {
    const envelope = parseSnsEnvelope(
      JSON.stringify({
        Type: "SubscriptionConfirmation",
        SubscribeURL: "https://sns.eu-west-2.amazonaws.com/?Action=ConfirmSubscription",
        Message: "confirm",
      }),
    )
    expect(envelope.Type).toBe("SubscriptionConfirmation")
    expect(envelope.SubscribeURL).toContain("ConfirmSubscription")
  })
})
