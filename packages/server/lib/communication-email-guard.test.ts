import { describe, expect, it } from "vitest"
import { emailTemplatePreferenceCategory } from "./communication-email-guard"

describe("emailTemplatePreferenceCategory", () => {
  it("maps online payments lifecycle templates as transactional", () => {
    expect(emailTemplatePreferenceCategory("onlinePaymentsSetupStarted")).toBe("transactional")
    expect(emailTemplatePreferenceCategory("onlinePaymentsActionRequired")).toBe("transactional")
    expect(emailTemplatePreferenceCategory("onlinePaymentsReady")).toBe("transactional")
  })
})
