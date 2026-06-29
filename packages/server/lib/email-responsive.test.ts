import { describe, expect, it } from "vitest"
import type { EmailAudience } from "./email-audience"
import {
  EMAIL_RESPONSIVE_MARKERS,
  generateBaseEmailTemplate,
  generateSupabaseAuthEmailHtml,
} from "./email-generator"
import { emailTemplates } from "./email-templates"
import { templateDefaultAudience, templateFixtures } from "./email-test-fixtures"

function assertEmailResponsive(html: string): void {
  for (const marker of EMAIL_RESPONSIVE_MARKERS) {
    expect(html).toContain(marker)
  }
  expect(html).toContain('class="email-outer"')
  expect(html).toContain(".cta-wrap {")
}

describe("responsive email layout", () => {
  it("base template includes mobile and dark-mode layout rules", () => {
    const html = generateBaseEmailTemplate(
      "Test",
      "",
      `<p class="confirmation-text">Hello</p>${generateTransactionDetailsTable([
        { label: "Transaction ID", value: "ET-1001" },
        { label: "Amount", value: "$100.00" },
      ])}`,
      { text: "View", url: "https://example.com" },
    )
    assertEmailResponsive(html)
    expect(html).toContain('class="cta-wrap"')
  })

  it("supabase auth templates inherit responsive layout", () => {
    assertEmailResponsive(generateSupabaseAuthEmailHtml("password_reset"))
    assertEmailResponsive(generateSupabaseAuthEmailHtml("signup_verify"))
  })

  for (const templateKey of Object.keys(emailTemplates)) {
    it(`${templateKey} html is responsive`, () => {
      const data = templateFixtures[templateKey]
      if (!data) return
      const audience: EmailAudience = templateDefaultAudience[templateKey] ?? "personal"
      const html = emailTemplates[templateKey].html(data, audience)
      assertEmailResponsive(html)
    })
  }
})

function generateTransactionDetailsTable(
  rows: { label: string; value: string }[],
): string {
  return `
    <div class="transaction-details">
      <table class="transaction-details-table" role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tbody>
          ${rows
            .map(
              (row) =>
                `<tr class="detail-row"><td class="detail-label">${row.label}</td><td class="detail-value">${row.value}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
}
