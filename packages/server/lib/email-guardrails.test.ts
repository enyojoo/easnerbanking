import { describe, expect, it } from "vitest"
import type { EmailAudience } from "./email-audience"
import { emailTemplates } from "./email-templates"
import { templateDefaultAudience, templateFixtures } from "./email-test-fixtures"

/** Banned patterns from docs/marketing/VOICE-AND-GUARDRAILS.md */
const BANNED_PATTERNS: RegExp[] = [
  /\binstant\b/i,
  /\bzero fee\b/i,
  /\bfree transfer/i,
  /\bFDIC\b/i,
  /\bEasner is a bank\b/i,
  /\bEasner tag\b/i,
  /\bEasner Personal\b(?! Banking)/i,
  /\bunder 5 minutes\b/i,
  /\bzero hidden fees\b/i,
  /\bHSM custody\b/i,
  /\bAI-powered AML\b/i,
]

const WELCOME_TEMPLATE_KEYS = new Set(["welcomeBusiness", "welcomePersonal"])

function allRenderedCopy(templateKey: string): string {
  const data = templateFixtures[templateKey]
  if (!data) return ""

  const template = emailTemplates[templateKey]
  const defaultAudience = templateDefaultAudience[templateKey] ?? "personal"
  const audiences: EmailAudience[] =
    templateKey.startsWith("kyb") ||
    templateKey.startsWith("onlinePayments") ||
    templateKey === "teamInvitation"
      ? ["business"]
      : templateKey.startsWith("kyc")
        ? ["personal"]
        : ["business", "personal"]

  const chunks: string[] = []
  for (const audience of audiences) {
    const subject =
      typeof template.subject === "function"
        ? template.subject(data, audience)
        : template.subject
    chunks.push(subject, template.html(data, audience), template.text(data, audience))
  }
  chunks.push(
    typeof template.subject === "function"
      ? template.subject(data, defaultAudience)
      : template.subject,
  )
  return chunks.join("\n")
}

describe("email guardrails (VOICE-AND-GUARDRAILS)", () => {
  for (const templateKey of Object.keys(emailTemplates)) {
    it(`${templateKey} avoids banned marketing phrases`, () => {
      const copy = allRenderedCopy(templateKey)
      if (!copy) return

      for (const pattern of BANNED_PATTERNS) {
        expect(copy).not.toMatch(pattern)
      }
    })
  }

  it("welcome templates mention fees may apply (qualifier)", () => {
    for (const key of WELCOME_TEMPLATE_KEYS) {
      const copy = allRenderedCopy(key)
      expect(copy.toLowerCase()).toMatch(/fees/)
    }
  })
})
