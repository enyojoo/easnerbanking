import { describe, expect, it } from "vitest"
import type { EmailAudience } from "./email-audience"
import { emailTemplates } from "./email-templates"
import { templateDefaultAudience, templateFixtures } from "./email-test-fixtures"

function renderSubject(
  templateKey: string,
  data: unknown,
  audience: EmailAudience,
): string {
  const template = emailTemplates[templateKey]
  return typeof template.subject === "function"
    ? template.subject(data, audience)
    : template.subject
}

describe("emailTemplates", () => {
  for (const templateKey of Object.keys(emailTemplates)) {
    describe(templateKey, () => {
      const data = templateFixtures[templateKey]
      if (!data) {
        it.skip("missing fixture", () => {})
        return
      }

      const defaultAudience = templateDefaultAudience[templateKey] ?? "personal"
      const audiences: EmailAudience[] =
        templateKey.startsWith("kyb") || templateKey === "teamInvitation"
          ? ["business"]
          : templateKey.startsWith("kyc")
            ? ["personal"]
            : ["business", "personal"]

      for (const audience of audiences) {
        it(`renders non-empty html and text for ${audience}`, () => {
          const template = emailTemplates[templateKey]
          const html = template.html(data, audience)
          const text = template.text(data, audience)
          const subject = renderSubject(templateKey, data, audience)

          expect(subject.trim().length).toBeGreaterThan(0)
          expect(html.trim().length).toBeGreaterThan(100)
          expect(text.trim().length).toBeGreaterThan(20)
          expect(html).toContain("<!DOCTYPE html>")
        })
      }

      it("uses default audience subject without throwing", () => {
        const subject = renderSubject(templateKey, data, defaultAudience)
        expect(subject).toBeTruthy()
      })
    })
  }

  it("transaction settled html includes amount and transaction id", () => {
    const data = templateFixtures.transactionSettled
    const html = emailTemplates.transactionSettled.html(data, "personal")
    expect(html).toContain("$100.00")
    expect(html).toContain("ET-1001")
  })

  it("welcome business html includes product name", () => {
    const html = emailTemplates.welcomeBusiness.html(templateFixtures.welcomeBusiness, "business")
    expect(html).toContain("Easner Business")
  })
})

// Dark-mode email variant not implemented — snapshots deferred until email-theme supports it.
