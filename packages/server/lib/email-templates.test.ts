import { describe, expect, it } from "vitest"
import type { EmailAudience } from "./email-audience"
import { emailTemplates } from "./email-templates"
import { templateDefaultAudience, templateFixtures } from "./email-test-fixtures"
import type { SecurityAlertEmailData } from "./email-types"

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

  it("transaction settled html includes greeting, summary, transaction id, and credited amount", () => {
    const data = { ...templateFixtures.transactionSettled, emailSubject: "Bank deposit complete" }
    const html = emailTemplates.transactionSettled.html(data, "personal")
    expect(html).toContain("Hey Sam,")
    expect(html).toContain("$99.95 credited to your USD Balance")
    expect(html).toContain("ET-1001")
    expect(html).toContain("https://app.easner.com/user/transactions/ET-1001")
  })

  it("failed transfer email omits duplicate Amount row and uses contact page CTA", () => {
    const html = emailTemplates.transactionFailed.html(templateFixtures.transactionFailed, "personal")
    expect(html).toContain("Recipient gets")
    expect(html).not.toContain(">Amount<")
    expect(html).toContain("https://www.easner.com/contact")
  })

  it("security alert emails use Hey greeting and contact page CTA", () => {
    const html = emailTemplates.mfaEnabled.html(
      templateFixtures.mfaEnabled as SecurityAlertEmailData,
      "personal",
    )
    expect(html).toContain("Hey Sam,")
    expect(html).toContain("https://www.easner.com/contact")
  })

  it("renders canonical detailRows (Sending / Processing fee / Transfer method) for payouts", () => {
    const html = emailTemplates.transactionFailed.html(templateFixtures.transactionFailed, "personal")
    expect(html).toContain("Sent")
    expect(html).toContain("Processing fee")
    expect(html).toContain("Total debited")
    expect(html).toContain("Transfer method")
    expect(html).toContain("Local transfer")
    // Combined fee row is used; no standalone Exchange fee row.
    expect(html).not.toContain(">Exchange fee<")
  })

  it("renders canonical deposit detailRows (Scheme / Sender / Amount credited)", () => {
    const html = emailTemplates.transactionSettled.html(templateFixtures.transactionSettled, "personal")
    expect(html).toContain(">Scheme<")
    expect(html).toContain(">Sender<")
    expect(html).toContain("Amount credited")
  })

  it("personal welcome uses Hey greeting and mobile dashboard deep link", () => {
    const html = emailTemplates.welcomePersonal.html(templateFixtures.welcomePersonal, "personal")
    expect(html).toContain("Hey Sam,")
    expect(html).toContain("https://app.easner.com/user/dashboard")
    expect(html).not.toContain('class="email-subtitle">Easner Banking')
    expect(html).toContain("Enyo Sam")
    expect(html).toContain("Founder, Easner")
  })

  it("personal KYC templates use Hey greeting and omit product name header subtitle", () => {
    const html = emailTemplates.kycApproved.html(templateFixtures.kycApproved, "personal")
    expect(html).toContain("Hey Sam,")
    expect(html).not.toContain('class="email-subtitle">Easner Banking')
  })

  it("personal security batch uses unified subject for MFA and new device", () => {
    const mfa = emailTemplates.mfaEnabled.subject(
      templateFixtures.mfaEnabled as SecurityAlertEmailData,
      "personal",
    )
    expect(mfa).toBe("Security update on your Easner account")
    const device = emailTemplates.newDeviceLogin.subject(
      templateFixtures.newDeviceLogin as SecurityAlertEmailData,
      "personal",
    )
    expect(device).toBe("Security update on your Easner account")
  })

  it("personal KYC subjects match brand pattern", () => {
    expect(
      emailTemplates.kycSubmitted.subject(templateFixtures.kycSubmitted, "personal"),
    ).toBe("Your Easner KYC verification submitted")
    expect(
      emailTemplates.kycApproved.subject(templateFixtures.kycApproved, "personal"),
    ).toBe("Your Easner KYC verification approved")
    expect(
      emailTemplates.kycRejected.subject(templateFixtures.kycRejected, "personal"),
    ).toBe("Your Easner KYC verification update")
  })

  it("personal templates include inbox preheader where expected", () => {
    const welcomeHtml = emailTemplates.welcomePersonal.html(
      templateFixtures.welcomePersonal,
      "personal",
    )
    expect(welcomeHtml).toContain("Verify your identity and start using Easner Mobile.")

    const kycHtml = emailTemplates.kycApproved.html(templateFixtures.kycApproved, "personal")
    expect(kycHtml).toContain("Your KYC verification is approved.")

    const mfaHtml = emailTemplates.mfaEnabled.html(
      templateFixtures.mfaEnabled as SecurityAlertEmailData,
      "personal",
    )
    expect(mfaHtml).toContain("Two-factor authentication was enabled on your Easner account.")

    const reversed = {
      ...templateFixtures.transactionReversed,
      body: "A recent transaction was reversed and your balance has been updated.",
    }
    const reversedHtml = emailTemplates.transactionReversed.html(reversed, "personal")
    expect(reversedHtml).toContain(reversed.body)
  })

  it("transaction detail rows use table cells so label and value do not run together", () => {
    const data = templateFixtures.transactionFailed
    const html = emailTemplates.transactionFailed.html(data, "personal")
    expect(html).toContain('<td class="detail-label" style="width:38%;max-width:38%;vertical-align:top;">Transaction ID</td>')
    expect(html).toContain(
      '<td class="detail-value" align="right" style="width:62%;max-width:62%;word-break:break-word;overflow-wrap:anywhere;white-space:normal;vertical-align:top;">ET-1001</td>',
    )
    expect(html).not.toContain("Transaction IDET-1001")
  })

  it("transaction detail values wrap instead of forcing nowrap overflow", () => {
    const html = emailTemplates.transactionFailed.html(templateFixtures.transactionFailed, "personal")
    expect(html).toContain("table-layout: fixed;")
    expect(html).toContain("white-space:normal;vertical-align:top;")
    expect(html).not.toMatch(/\.detail-value \{[^}]*white-space: nowrap/)
  })

  it("transaction details stack on narrow screens", () => {
    const html = emailTemplates.transactionFailed.html(templateFixtures.transactionFailed, "personal")
    expect(html).toContain(".transaction-details-table tr,")
    expect(html).toContain("display: block !important;")
    expect(html).toContain("word-break: break-word;")
    expect(html).toContain(".detail-row .detail-value {")
    expect(html).toContain("text-align: left !important;")
  })

  it("business welcome uses Hey greeting", () => {
    const html = emailTemplates.welcomeBusiness.html(templateFixtures.welcomeBusiness, "business")
    expect(html).toContain("Hey Alex,")
    expect(html).toContain("https://business.easner.com/dashboard")
    expect(html).not.toContain('class="email-subtitle">Easner Business Banking')
    expect(html).toContain("Complete KYB, fund your account, and explore global payouts and collections.")
  })

  it("business KYB templates omit product name header subtitle", () => {
    const html = emailTemplates.kybApproved.html(templateFixtures.kybApproved, "business")
    expect(html).not.toContain('class="email-subtitle">Easner Business Banking')
  })

  it("team invitation uses Hey there greeting and omits business name header subtitle", () => {
    const html = emailTemplates.teamInvitation.html(templateFixtures.teamInvitation, "business")
    expect(html).toContain("Hey there,")
    expect(html).not.toContain('class="email-subtitle">Acme LLC')
    expect(html).not.toContain('class="email-subtitle">')
    expect(html).toContain("Acme LLC")
  })

  it("business KYB subjects match brand pattern", () => {
    expect(
      emailTemplates.kybSubmitted.subject(templateFixtures.kybSubmitted, "business"),
    ).toBe("Your Easner KYB verification submitted")
    expect(
      emailTemplates.kybApproved.subject(templateFixtures.kybApproved, "business"),
    ).toBe("Your Easner KYB verification approved")
    expect(
      emailTemplates.kybRejected.subject(templateFixtures.kybRejected, "business"),
    ).toBe("Your Easner KYB verification update")
  })

  it("business security uses Easner Business subjects", () => {
    const pwd = emailTemplates.passwordChanged.subject(
      { ...templateFixtures.passwordChanged, audience: "business" } as SecurityAlertEmailData,
      "business",
    )
    expect(pwd).toBe("Your Easner Business password was changed")
    const mfa = emailTemplates.mfaEnabled.subject(
      { ...templateFixtures.mfaEnabled, audience: "business" } as SecurityAlertEmailData,
      "business",
    )
    expect(mfa).toBe("Security update on your Easner Business account")
  })

  it("transaction settled html uses business detail url for business audience", () => {
    const data = {
      ...templateFixtures.transactionSettled,
      emailSubject: "Bank deposit complete",
      detailUrl: "https://business.easner.com/transactions/ET-1001",
      audience: "business" as const,
    }
    const html = emailTemplates.transactionSettled.html(data, "business")
    expect(html).toContain("https://business.easner.com/transactions/ET-1001")
  })

  it("welcome business html mentions Easner Business in body copy", () => {
    const html = emailTemplates.welcomeBusiness.html(templateFixtures.welcomeBusiness, "business")
    expect(html).toContain("Easner Business account")
  })
})

// Dark-mode email variant not implemented — snapshots deferred until email-theme supports it.
